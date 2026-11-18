-- =============================================================================
-- VELOX Digital Garage — 0300 Component Registry
-- Categories, brands, components, specifications, compatibility attributes.
--
-- Data provenance is explicit on every component (verification_status) and every
-- specification (source). Unknown specifications are simply absent: the UI renders
-- them as "Unavailable" rather than guessing.
-- =============================================================================

create type public.component_verification as enum (
  'demo',                  -- clearly labelled sample data shipped with VELOX
  'user_submitted',        -- entered by a rider, not verified
  'community_verified',    -- reviewed by a VELOX moderator
  'manufacturer_verified'  -- checked against a manufacturer source (source_url required)
);

create type public.data_source as enum ('manufacturer', 'community', 'user', 'demo');

create table public.component_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique constraint component_categories_slug check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null,
  description  text,
  -- Bicycle slots a component of this category may occupy.
  slots        public.bike_slot[] not null default '{}',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table public.component_brands (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique constraint component_brands_slug check (slug ~ '^[a-z0-9-]{2,60}$'),
  name         text not null constraint component_brands_name_len check (char_length(name) between 1 and 60),
  website_url  text constraint component_brands_website check (website_url is null or website_url ~ '^https?://'),
  country      text,
  is_demo      boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.components (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique constraint components_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  brand_id             uuid not null references public.component_brands (id) on delete restrict,
  category_id          uuid not null references public.component_categories (id) on delete restrict,
  name                 text not null constraint components_name_len check (char_length(btrim(name)) between 1 and 120),
  model                text constraint components_model_len check (char_length(model) <= 80),
  description          text constraint components_description_len check (char_length(description) <= 4000),
  weight_g             numeric(8, 1) constraint components_weight_positive check (weight_g > 0),
  material             text constraint components_material_len check (char_length(material) <= 60),
  price_reference      numeric(10, 2) constraint components_price_positive check (price_reference >= 0),
  currency             char(3) constraint components_currency check (currency ~ '^[A-Z]{3}$'),
  manufacturer_ref     text constraint components_mref_len check (char_length(manufacturer_ref) <= 80),
  source_url           text constraint components_source_url check (source_url is null or source_url ~ '^https?://'),
  verification_status  public.component_verification not null default 'user_submitted',
  is_demo              boolean generated always as (verification_status = 'demo') stored,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint components_price_has_currency check (price_reference is null or currency is not null),
  constraint components_verified_has_source check (verification_status <> 'manufacturer_verified' or source_url is not null)
);

create index components_category_idx on public.components (category_id);
create index components_brand_idx on public.components (brand_id);
create index components_name_idx on public.components (lower(name));

create trigger components_set_updated_at
  before update on public.components
  for each row execute function public.set_updated_at();

create table public.component_images (
  id            uuid primary key default gen_random_uuid(),
  component_id  uuid not null references public.components (id) on delete cascade,
  url           text not null constraint component_images_url check (url ~ '^(https?://|/)'),
  alt           text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index component_images_component_idx on public.component_images (component_id, sort_order);

create table public.component_specifications (
  id             uuid primary key default gen_random_uuid(),
  component_id   uuid not null references public.components (id) on delete cascade,
  spec_key       text not null constraint component_specs_key check (spec_key ~ '^[a-z0-9_]{1,48}$'),
  label          text not null,
  value_text     text,
  value_numeric  numeric,
  unit           text,
  source         public.data_source not null default 'user',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint component_specs_has_value check (value_text is not null or value_numeric is not null),
  constraint component_specs_unique unique (component_id, spec_key)
);

-- Structured compatibility attributes ("interfaces") of a component.
-- The rules that compare them live in the application compatibility engine
-- (src/lib/compatibility), keyed by `attribute`.
create table public.component_compatibility_rules (
  id             uuid primary key default gen_random_uuid(),
  component_id   uuid not null references public.components (id) on delete cascade,
  attribute      text not null constraint compat_attribute_format check (attribute ~ '^[a-z0-9_]{1,48}$'),
  value_text     text,
  value_list     text[],
  value_numeric  numeric,
  unit           text,
  notes          text,
  source         public.data_source not null default 'user',
  created_at     timestamptz not null default now(),
  constraint compat_has_value check (value_text is not null or value_list is not null or value_numeric is not null),
  constraint compat_unique unique (component_id, attribute)
);
create index compat_attribute_idx on public.component_compatibility_rules (attribute);

-- Read model for the catalogue: one row per component with brand + category info.
create view public.component_catalog
with (security_invoker = true) as
select
  c.id, c.slug, c.name, c.model, c.description, c.weight_g, c.material,
  c.price_reference, c.currency, c.manufacturer_ref, c.source_url,
  c.verification_status, c.is_demo, c.created_by, c.created_at, c.updated_at,
  b.id as brand_id, b.slug as brand_slug, b.name as brand_name,
  cat.id as category_id, cat.slug as category_slug, cat.name as category_name, cat.slots as category_slots
from public.components c
join public.component_brands b on b.id = c.brand_id
join public.component_categories cat on cat.id = c.category_id;

-- ---------------------------------------------------------------------------
-- Authorisation helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_component(p_component_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_moderator() or exists (
    select 1 from public.components
    where id = p_component_id
      and created_by = auth.uid()
      and verification_status = 'user_submitted'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — the catalogue is public; riders may submit (unverified) components;
-- only moderators can verify, feature or edit others' entries.
-- ---------------------------------------------------------------------------
alter table public.component_categories enable row level security;
alter table public.component_brands enable row level security;
alter table public.components enable row level security;
alter table public.component_images enable row level security;
alter table public.component_specifications enable row level security;
alter table public.component_compatibility_rules enable row level security;

create policy "categories are public" on public.component_categories for select using (true);
create policy "moderators manage categories" on public.component_categories
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

create policy "brands are public" on public.component_brands for select using (true);
create policy "riders add brands" on public.component_brands
  for insert to authenticated
  with check (created_by = auth.uid() and is_demo = false);
create policy "moderators manage brands" on public.component_brands
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

create policy "components are public" on public.components for select using (true);
create policy "riders submit components" on public.components
  for insert to authenticated
  with check (
    public.is_moderator()
    or (created_by = auth.uid() and verification_status = 'user_submitted')
  );
create policy "editors update components" on public.components
  for update to authenticated
  using (public.can_edit_component(id))
  with check (
    public.is_moderator()
    or (created_by = auth.uid() and verification_status = 'user_submitted')
  );
create policy "editors delete components" on public.components
  for delete to authenticated
  using (public.can_edit_component(id));

-- created_by / created_at / is_demo are immutable from clients (table-level revoke,
-- then explicit column grants — a column-level REVOKE alone would not override the table grant).
revoke update on public.components from authenticated;
grant update (
  slug, brand_id, category_id, name, model, description, weight_g, material,
  price_reference, currency, manufacturer_ref, source_url, verification_status
) on public.components to authenticated;

create policy "component images are public" on public.component_images for select using (true);
create policy "editors manage component images" on public.component_images
  for all to authenticated
  using (public.can_edit_component(component_id))
  with check (public.can_edit_component(component_id));

create policy "specifications are public" on public.component_specifications for select using (true);
create policy "editors manage specifications" on public.component_specifications
  for all to authenticated
  using (public.can_edit_component(component_id))
  with check (
    public.can_edit_component(component_id)
    and (public.is_moderator() or source in ('user'))
  );

create policy "compatibility attributes are public" on public.component_compatibility_rules for select using (true);
create policy "editors manage compatibility attributes" on public.component_compatibility_rules
  for all to authenticated
  using (public.can_edit_component(component_id))
  with check (
    public.can_edit_component(component_id)
    and (public.is_moderator() or source in ('user'))
  );

revoke insert, update, delete on
  public.component_categories, public.component_brands, public.components,
  public.component_images, public.component_specifications, public.component_compatibility_rules
from anon;
