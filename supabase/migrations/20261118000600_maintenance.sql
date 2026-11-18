-- =============================================================================
-- VELOX Digital Garage — 0600 Maintenance
-- Only data the rider enters. Distance is optional and never inferred.
-- =============================================================================

create type public.maintenance_type as enum (
  'inspection', 'cleaning', 'lubrication', 'adjustment', 'repair', 'replacement',
  'installation', 'brake_bleed', 'tubeless_sealant', 'wheel_true', 'bearing_service',
  'suspension_service', 'other'
);

create table public.maintenance_records (
  id                     uuid primary key default gen_random_uuid(),
  bicycle_id             uuid not null references public.bicycles (id) on delete cascade,
  owner_id               uuid not null references public.profiles (id) on delete cascade,
  slot                   public.bike_slot,
  bicycle_component_id   uuid references public.bicycle_components (id) on delete set null,
  maintenance_type       public.maintenance_type not null,
  title                  text not null constraint maintenance_title_len check (char_length(btrim(title)) between 1 and 120),
  performed_on           date not null constraint maintenance_not_future check (performed_on <= current_date + 1),
  cost                   numeric(10, 2) constraint maintenance_cost_positive check (cost >= 0),
  currency               char(3) constraint maintenance_currency check (currency ~ '^[A-Z]{3}$'),
  distance_km            numeric(9, 1) constraint maintenance_distance_positive check (distance_km >= 0),
  notes                  text constraint maintenance_notes_len check (char_length(notes) <= 4000),
  next_due_on            date,
  next_due_distance_km   numeric(9, 1) constraint maintenance_next_distance_positive check (next_due_distance_km >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint maintenance_cost_currency check (cost is null or currency is not null),
  constraint maintenance_next_after_performed check (next_due_on is null or next_due_on >= performed_on),
  constraint maintenance_next_distance_after check (
    next_due_distance_km is null or distance_km is null or next_due_distance_km >= distance_km
  )
);
create index maintenance_bicycle_idx on public.maintenance_records (bicycle_id, performed_on desc);
create index maintenance_due_idx on public.maintenance_records (owner_id, next_due_on) where next_due_on is not null;

create trigger maintenance_records_set_updated_at
  before update on public.maintenance_records
  for each row execute function public.set_updated_at();

create trigger maintenance_records_owner
  before insert or update on public.maintenance_records
  for each row execute function public.enforce_child_owner();

create table public.maintenance_photos (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references public.maintenance_records (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null unique,
  created_at    timestamptz not null default now()
);
create index maintenance_photos_record_idx on public.maintenance_photos (record_id);

alter table public.maintenance_records enable row level security;
alter table public.maintenance_photos enable row level security;

create policy "owners manage maintenance" on public.maintenance_records
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners manage maintenance photos" on public.maintenance_photos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.maintenance_records r where r.id = record_id and r.owner_id = auth.uid())
  );

revoke all on public.maintenance_records, public.maintenance_photos from anon;
revoke update on public.maintenance_records from authenticated;
grant update (
  slot, bicycle_component_id, maintenance_type, title, performed_on, cost, currency,
  distance_km, notes, next_due_on, next_due_distance_km
) on public.maintenance_records to authenticated;
