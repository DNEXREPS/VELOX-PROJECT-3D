-- =============================================================================
-- VELOX Digital Garage — 0400 Builds & Revisions
--
-- `bicycle_components` is the CURRENT configuration of a bicycle.
-- `bicycle_build_revisions` is an append-only, immutable history.
--
-- Clients have NO direct write access to bicycle_components. Every change goes
-- through public.apply_bicycle_configuration(), which atomically:
--   1. verifies ownership,
--   2. snapshots the previous configuration,
--   3. applies the changes (validating slot/category fit),
--   4. snapshots the new configuration and diffs it,
--   5. appends a revision.
-- This guarantees history can never be silently overwritten.
-- =============================================================================

create table public.bicycle_builds (
  id           uuid primary key default gen_random_uuid(),
  bicycle_id   uuid not null references public.bicycles (id) on delete cascade,
  name         text not null default 'Primary build' constraint bicycle_builds_name_len check (char_length(name) between 1 and 80),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index bicycle_builds_one_active on public.bicycle_builds (bicycle_id) where is_active;

create trigger bicycle_builds_set_updated_at
  before update on public.bicycle_builds
  for each row execute function public.set_updated_at();

create table public.bicycle_components (
  id             uuid primary key default gen_random_uuid(),
  bicycle_id     uuid not null references public.bicycles (id) on delete cascade,
  slot           public.bike_slot not null,
  component_id   uuid references public.components (id) on delete restrict,
  -- Free-text part for components not (yet) in the registry.
  custom_name    text constraint bicycle_components_custom_name_len check (char_length(custom_name) <= 120),
  price_paid     numeric(10, 2) constraint bicycle_components_price check (price_paid >= 0),
  currency       char(3) constraint bicycle_components_currency check (currency ~ '^[A-Z]{3}$'),
  installed_on   date,
  notes          text constraint bicycle_components_notes_len check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bicycle_components_slot_unique unique (bicycle_id, slot),
  constraint bicycle_components_has_part check (component_id is not null or custom_name is not null),
  constraint bicycle_components_price_currency check (price_paid is null or currency is not null)
);
create index bicycle_components_component_idx on public.bicycle_components (component_id);

create trigger bicycle_components_set_updated_at
  before update on public.bicycle_components
  for each row execute function public.set_updated_at();

create table public.bicycle_build_revisions (
  id                      uuid primary key default gen_random_uuid(),
  build_id                uuid not null references public.bicycle_builds (id) on delete cascade,
  bicycle_id              uuid not null references public.bicycles (id) on delete cascade,
  revision_number         integer not null constraint revisions_number_positive check (revision_number > 0),
  previous_configuration  jsonb not null,
  new_configuration       jsonb not null,
  changes                 jsonb not null constraint revisions_changes_array check (jsonb_typeof(changes) = 'array'),
  description             text constraint revisions_description_len check (char_length(description) <= 500),
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  constraint revisions_number_unique unique (build_id, revision_number)
);
create index revisions_bicycle_idx on public.bicycle_build_revisions (bicycle_id, created_at desc);

-- Revisions are immutable.
create or replace function public.prevent_revision_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'build revisions are immutable' using errcode = 'insufficient_privilege';
end;
$$;

create trigger bicycle_build_revisions_immutable
  before update on public.bicycle_build_revisions
  for each row execute function public.prevent_revision_update();

-- ---------------------------------------------------------------------------
-- Snapshot of the current configuration, keyed by slot. Captures names/specs
-- at that moment so history stays readable even if catalogue entries change.
-- ---------------------------------------------------------------------------
create or replace function public.bicycle_configuration_snapshot(p_bicycle_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(bc.slot::text, jsonb_strip_nulls(jsonb_build_object(
    'component_id', bc.component_id,
    'name', coalesce(c.name, bc.custom_name),
    'brand', b.name,
    'model', c.model,
    'category', cat.slug,
    'weight_g', c.weight_g,
    'price_reference', c.price_reference,
    'currency', coalesce(bc.currency, c.currency),
    'price_paid', bc.price_paid,
    'installed_on', bc.installed_on,
    'verification_status', c.verification_status,
    'custom', bc.component_id is null
  )) order by bc.slot), '{}'::jsonb)
  from public.bicycle_components bc
  left join public.components c on c.id = bc.component_id
  left join public.component_brands b on b.id = c.brand_id
  left join public.component_categories cat on cat.id = c.category_id
  where bc.bicycle_id = p_bicycle_id;
$$;

-- Diff two snapshots into a list of {slot, action, from, to}.
create or replace function public.diff_configurations(p_prev jsonb, p_next jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(change order by slot), '[]'::jsonb)
  from (
    select
      k.slot,
      jsonb_strip_nulls(jsonb_build_object(
        'slot', k.slot,
        'action', case
          when p_prev -> k.slot is null then 'added'
          when p_next -> k.slot is null then 'removed'
          when (p_prev -> k.slot ->> 'component_id') is distinct from (p_next -> k.slot ->> 'component_id')
            or (p_prev -> k.slot ->> 'name') is distinct from (p_next -> k.slot ->> 'name') then 'replaced'
          else 'updated'
        end,
        'from', p_prev -> k.slot,
        'to', p_next -> k.slot
      )) as change
    from (
      select jsonb_object_keys(p_prev) as slot
      union
      select jsonb_object_keys(p_next)
    ) k
    where (p_prev -> k.slot) is distinct from (p_next -> k.slot)
  ) d;
$$;

-- ---------------------------------------------------------------------------
-- The only write path for bicycle configurations.
-- p_changes: [{ "slot": "cassette", "component_id": "<uuid>"|null, "custom_name": text|null,
--               "price_paid": number|null, "currency": "EUR"|null, "installed_on": "YYYY-MM-DD"|null,
--               "notes": text|null, "remove": bool }]
-- ---------------------------------------------------------------------------
create or replace function public.apply_bicycle_configuration(
  p_bicycle_id uuid,
  p_changes jsonb,
  p_description text default null
)
returns public.bicycle_build_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner     uuid;
  v_uid       uuid := auth.uid();
  v_prev      jsonb;
  v_next      jsonb;
  v_diff      jsonb;
  v_build_id  uuid;
  v_number    integer;
  v_change    jsonb;
  v_slot      public.bike_slot;
  v_component uuid;
  v_custom    text;
  v_slots     public.bike_slot[];
  v_revision  public.bicycle_build_revisions;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select owner_id into v_owner from public.bicycles where id = p_bicycle_id for update;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'changes must be a non-empty array' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_changes) > 40 then
    raise exception 'too many changes' using errcode = 'invalid_parameter_value';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'description too long' using errcode = 'invalid_parameter_value';
  end if;

  v_prev := public.bicycle_configuration_snapshot(p_bicycle_id);

  for v_change in select * from jsonb_array_elements(p_changes) loop
    v_slot := (v_change ->> 'slot')::public.bike_slot;

    if coalesce((v_change ->> 'remove')::boolean, false) then
      delete from public.bicycle_components where bicycle_id = p_bicycle_id and slot = v_slot;
      continue;
    end if;

    v_component := nullif(v_change ->> 'component_id', '')::uuid;
    v_custom := nullif(btrim(coalesce(v_change ->> 'custom_name', '')), '');

    if v_component is null and v_custom is null then
      raise exception 'slot % needs a component or a custom name', v_slot using errcode = 'invalid_parameter_value';
    end if;

    if v_component is not null then
      select cat.slots into v_slots
      from public.components c join public.component_categories cat on cat.id = c.category_id
      where c.id = v_component;
      if v_slots is null then
        raise exception 'component % not found', v_component using errcode = 'foreign_key_violation';
      end if;
      if not (v_slot = any (v_slots)) then
        raise exception 'component category does not fit slot %', v_slot using errcode = 'check_violation';
      end if;
    end if;

    insert into public.bicycle_components (bicycle_id, slot, component_id, custom_name, price_paid, currency, installed_on, notes)
    values (
      p_bicycle_id, v_slot, v_component, case when v_component is null then v_custom end,
      (v_change ->> 'price_paid')::numeric,
      nullif(v_change ->> 'currency', ''),
      nullif(v_change ->> 'installed_on', '')::date,
      nullif(v_change ->> 'notes', '')
    )
    on conflict (bicycle_id, slot) do update set
      component_id = excluded.component_id,
      custom_name  = excluded.custom_name,
      price_paid   = excluded.price_paid,
      currency     = excluded.currency,
      installed_on = excluded.installed_on,
      notes        = excluded.notes;
  end loop;

  v_next := public.bicycle_configuration_snapshot(p_bicycle_id);
  v_diff := public.diff_configurations(v_prev, v_next);

  if jsonb_array_length(v_diff) = 0 then
    raise exception 'configuration unchanged' using errcode = 'invalid_parameter_value';
  end if;

  select id into v_build_id from public.bicycle_builds where bicycle_id = p_bicycle_id and is_active;
  if v_build_id is null then
    insert into public.bicycle_builds (bicycle_id) values (p_bicycle_id) returning id into v_build_id;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_number
  from public.bicycle_build_revisions where build_id = v_build_id;

  insert into public.bicycle_build_revisions (
    build_id, bicycle_id, revision_number, previous_configuration, new_configuration, changes, description, created_by
  ) values (
    v_build_id, p_bicycle_id, v_number, v_prev, v_next, v_diff, nullif(btrim(p_description), ''), v_uid
  ) returning * into v_revision;

  update public.bicycles set updated_at = now() where id = p_bicycle_id;

  return v_revision;
end;
$$;

revoke execute on function public.apply_bicycle_configuration(uuid, jsonb, text) from public, anon;
grant execute on function public.apply_bicycle_configuration(uuid, jsonb, text) to authenticated;
revoke execute on function public.bicycle_configuration_snapshot(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: owners READ their builds; nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.bicycle_builds enable row level security;
alter table public.bicycle_components enable row level security;
alter table public.bicycle_build_revisions enable row level security;

create policy "owners read builds" on public.bicycle_builds
  for select to authenticated using (public.owns_bicycle(bicycle_id));
create policy "owners rename builds" on public.bicycle_builds
  for update to authenticated using (public.owns_bicycle(bicycle_id)) with check (public.owns_bicycle(bicycle_id));

create policy "owners read configuration" on public.bicycle_components
  for select to authenticated using (public.owns_bicycle(bicycle_id));

create policy "owners read revisions" on public.bicycle_build_revisions
  for select to authenticated using (public.owns_bicycle(bicycle_id));

revoke all on public.bicycle_builds, public.bicycle_components, public.bicycle_build_revisions from anon;
revoke insert, update, delete on public.bicycle_components, public.bicycle_build_revisions from authenticated;
revoke insert, delete, update on public.bicycle_builds from authenticated;
grant update (name) on public.bicycle_builds to authenticated;
