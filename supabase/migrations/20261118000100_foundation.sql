-- =============================================================================
-- VELOX Digital Garage — 0100 Foundation
-- Extensions, shared enums, profiles, role helpers, timestamp triggers.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------
create type public.profile_role as enum ('user', 'moderator', 'admin');

create type public.bicycle_category as enum (
  'road', 'gravel', 'mountain', 'cyclocross', 'time_trial', 'track',
  'touring', 'city', 'bmx', 'ebike', 'other'
);

create type public.frame_material as enum ('carbon', 'aluminium', 'steel', 'titanium', 'other');

create type public.bicycle_visibility as enum ('private', 'public');

-- Positions a component can occupy on a bicycle. Mirrors src/lib/domain/slots.ts.
create type public.bike_slot as enum (
  'frame', 'fork', 'headset', 'stem', 'handlebar', 'bar_tape', 'shifters',
  'front_brake', 'rear_brake', 'front_rotor', 'rear_rotor',
  'wheelset', 'front_tire', 'rear_tire', 'tubes',
  'crankset', 'bottom_bracket', 'chain', 'cassette',
  'front_derailleur', 'rear_derailleur', 'saddle', 'seatpost', 'pedals',
  'groupset', 'accessory_1', 'accessory_2', 'accessory_3'
);

-- ---------------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Safe text -> uuid cast used by storage policies (returns null instead of raising).
create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name  text constraint profiles_display_name_len check (char_length(display_name) <= 60),
  bio           text constraint profiles_bio_len check (char_length(bio) <= 500),
  location      text constraint profiles_location_len check (char_length(location) <= 80),
  website_url   text constraint profiles_website_format
                  check (website_url is null or (website_url ~ '^https?://' and char_length(website_url) <= 200)),
  avatar_path   text,
  role          public.profile_role not null default 'user',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Public rider profile. role is only writable by the service role / moderation functions.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers. SECURITY DEFINER so they can be used inside RLS policies of other tables
-- without recursive policy evaluation.
create or replace function public.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role in ('moderator', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- Create a profile automatically when a Supabase auth user is created.
-- The requested username comes from sign-up metadata; on conflict or invalid input a
-- deterministic fallback is used so sign-up never fails because of the profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_display   text := nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), '');
  v_fallback  text := 'rider_' || substr(replace(new.id::text, '-', ''), 1, 12);
begin
  if v_requested !~ '^[a-z0-9_]{3,24}$' then
    v_requested := v_fallback;
  end if;

  begin
    insert into public.profiles (id, username, display_name)
    values (new.id, v_requested, v_display);
  exception when unique_violation then
    insert into public.profiles (id, username, display_name)
    values (new.id, v_fallback, v_display);
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Username availability check usable before sign-up (anon).
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- ---------------------------------------------------------------------------
-- RLS: profiles are public identity cards; only the owner edits safe columns.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Column-level privileges: role, id and timestamps cannot be changed by clients.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, bio, location, website_url, avatar_path)
  on public.profiles to authenticated;

grant execute on function public.is_username_available(text) to anon, authenticated;
