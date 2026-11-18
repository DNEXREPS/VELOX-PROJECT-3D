-- =============================================================================
-- VELOX Digital Garage — 0200 Garage
-- Bicycles, owner-only private details, bicycle images.
--
-- Privacy model: the base `bicycles` table is readable ONLY by its owner.
-- Public consumers read through the masked `bicycle_passports` view (0700).
-- Data that must never be public (serial number, purchase price/date) lives in
-- `bicycle_private_details`, which has no public read path at all.
-- =============================================================================

create table public.bicycles (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null references public.profiles (id) on delete cascade,
  slug                       text not null
                               constraint bicycles_slug_format
                               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name                       text not null constraint bicycles_name_len check (char_length(btrim(name)) between 1 and 80),
  brand                      text constraint bicycles_brand_len check (char_length(brand) <= 60),
  model                      text constraint bicycles_model_len check (char_length(model) <= 80),
  category                   public.bicycle_category not null default 'road',
  frame_material             public.frame_material,
  frame_size                 text constraint bicycles_frame_size_len check (char_length(frame_size) <= 20),
  model_year                 smallint constraint bicycles_model_year_range check (model_year between 1860 and 2100),
  color                      text constraint bicycles_color_len check (char_length(color) <= 40),
  color_hex                  text constraint bicycles_color_hex check (color_hex ~ '^#[0-9a-fA-F]{6}$'),
  weight_kg                  numeric(5, 2) constraint bicycles_weight_range check (weight_kg > 0 and weight_kg < 100),
  estimated_value            numeric(12, 2) constraint bicycles_value_positive check (estimated_value >= 0),
  value_currency             char(3) not null default 'EUR' constraint bicycles_currency check (value_currency ~ '^[A-Z]{3}$'),
  description                text constraint bicycles_description_len check (char_length(description) <= 4000),
  cover_image_path           text,
  model_key                  text not null default 'velox-placeholder-road'
                               constraint bicycles_model_key_format check (model_key ~ '^[a-z0-9-]{1,64}$'),
  visibility                 public.bicycle_visibility not null default 'private',
  is_primary                 boolean not null default false,
  -- Owner-controlled Digital Bike Passport field visibility.
  passport_show_weight       boolean not null default true,
  passport_show_value        boolean not null default false,
  passport_show_components   boolean not null default true,
  passport_show_history      boolean not null default true,
  passport_show_maintenance  boolean not null default false,
  last_accessed_at           timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint bicycles_owner_slug_unique unique (owner_id, slug)
);

create unique index bicycles_one_primary_per_owner on public.bicycles (owner_id) where is_primary;
create index bicycles_owner_idx on public.bicycles (owner_id, created_at desc);
create index bicycles_public_idx on public.bicycles (created_at desc) where visibility = 'public';
create index bicycles_public_category_idx on public.bicycles (category) where visibility = 'public';

create trigger bicycles_set_updated_at
  before update on public.bicycles
  for each row execute function public.set_updated_at();

-- Owner-only data that never appears on any public surface.
create table public.bicycle_private_details (
  bicycle_id         uuid primary key references public.bicycles (id) on delete cascade,
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  serial_number      text constraint private_serial_len check (char_length(serial_number) <= 64),
  purchase_price     numeric(12, 2) constraint private_price_positive check (purchase_price >= 0),
  purchase_currency  char(3) not null default 'EUR' constraint private_currency check (purchase_currency ~ '^[A-Z]{3}$'),
  purchase_date      date constraint private_purchase_date check (purchase_date <= current_date + 1),
  private_notes      text constraint private_notes_len check (char_length(private_notes) <= 4000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger bicycle_private_details_set_updated_at
  before update on public.bicycle_private_details
  for each row execute function public.set_updated_at();

create table public.bicycle_images (
  id            uuid primary key default gen_random_uuid(),
  bicycle_id    uuid not null references public.bicycles (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null unique,
  caption       text constraint bicycle_images_caption_len check (char_length(caption) <= 200),
  sort_order    integer not null default 0,
  width         integer,
  height        integer,
  created_at    timestamptz not null default now()
);

create index bicycle_images_bicycle_idx on public.bicycle_images (bicycle_id, sort_order);

-- ---------------------------------------------------------------------------
-- Ownership helpers (SECURITY DEFINER: usable from policies on other tables and
-- from storage policies without exposing bicycles rows to the caller).
-- ---------------------------------------------------------------------------
create or replace function public.owns_bicycle(p_bicycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bicycles where id = p_bicycle_id and owner_id = auth.uid()
  );
$$;

create or replace function public.bicycle_is_public(p_bicycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bicycles where id = p_bicycle_id and visibility = 'public'
  );
$$;

create or replace function public.bicycle_passport_flag(p_bicycle_id uuid, p_flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_flag
      when 'components' then passport_show_components
      when 'history' then passport_show_history
      when 'maintenance' then passport_show_maintenance
      when 'value' then passport_show_value
      when 'weight' then passport_show_weight
      else false
    end
    from public.bicycles
    where id = p_bicycle_id and visibility = 'public'
  ), false);
$$;

-- Child rows must carry the bicycle's real owner (prevents spoofed owner_id).
create or replace function public.enforce_child_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.bicycles where id = new.bicycle_id;
  if v_owner is null then
    raise exception 'bicycle % not found', new.bicycle_id using errcode = 'foreign_key_violation';
  end if;
  if new.owner_id is distinct from v_owner then
    raise exception 'owner_id must match the bicycle owner' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bicycle_private_details_owner
  before insert or update on public.bicycle_private_details
  for each row execute function public.enforce_child_owner();

create trigger bicycle_images_owner
  before insert or update on public.bicycle_images
  for each row execute function public.enforce_child_owner();

-- Exactly-one-primary toggle, executed atomically.
create or replace function public.set_primary_bicycle(p_bicycle_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_bicycle(p_bicycle_id) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.bicycles set is_primary = false where owner_id = auth.uid() and is_primary and id <> p_bicycle_id;
  update public.bicycles set is_primary = true where id = p_bicycle_id;
end;
$$;

create or replace function public.touch_bicycle(p_bicycle_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.bicycles set last_accessed_at = now()
  where id = p_bicycle_id and owner_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bicycles enable row level security;
alter table public.bicycle_private_details enable row level security;
alter table public.bicycle_images enable row level security;

create policy "owners read their bicycles" on public.bicycles
  for select to authenticated using (owner_id = auth.uid());
create policy "owners create bicycles" on public.bicycles
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update bicycles" on public.bicycles
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete bicycles" on public.bicycles
  for delete to authenticated using (owner_id = auth.uid());

-- owner_id, id and timestamps are immutable from the client.
revoke all on public.bicycles from anon;
revoke update on public.bicycles from authenticated;
grant update (
  slug, name, brand, model, category, frame_material, frame_size, model_year, color, color_hex,
  weight_kg, estimated_value, value_currency, description, cover_image_path, model_key, visibility,
  is_primary, passport_show_weight, passport_show_value, passport_show_components,
  passport_show_history, passport_show_maintenance, last_accessed_at
) on public.bicycles to authenticated;

create policy "owners manage private details" on public.bicycle_private_details
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
revoke all on public.bicycle_private_details from anon;

create policy "bicycle images are visible to owner or when bicycle is public" on public.bicycle_images
  for select using (owner_id = auth.uid() or public.bicycle_is_public(bicycle_id));
create policy "owners add images" on public.bicycle_images
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update images" on public.bicycle_images
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete images" on public.bicycle_images
  for delete to authenticated using (owner_id = auth.uid());
revoke insert, update, delete on public.bicycle_images from anon;
