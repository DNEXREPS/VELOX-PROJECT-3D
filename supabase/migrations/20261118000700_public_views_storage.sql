-- =============================================================================
-- VELOX Digital Garage — 0700 Public read models (Digital Bike Passport) & Storage
--
-- These views intentionally run with the view owner's privileges
-- (security_invoker = false) so anonymous visitors can read PUBLIC bicycles without
-- being granted access to the base tables. Every view therefore:
--   * filters to visibility = 'public' itself, and
--   * masks each field according to the owner's passport_* toggles.
-- Fields that are never public (serial number, purchase data, private notes,
-- maintenance notes) are simply not selected.
-- =============================================================================

create view public.bicycle_passports
with (security_invoker = false, security_barrier = true) as
select
  b.id,
  b.slug,
  b.name,
  b.brand,
  b.model,
  b.category,
  b.frame_material,
  b.frame_size,
  b.model_year,
  b.color,
  b.color_hex,
  case when b.passport_show_weight then b.weight_kg end as weight_kg,
  case when b.passport_show_value then b.estimated_value end as estimated_value,
  case when b.passport_show_value then b.value_currency end as value_currency,
  b.description,
  b.cover_image_path,
  b.model_key,
  b.passport_show_weight as show_weight,
  b.passport_show_value as show_value,
  b.passport_show_components as show_components,
  b.passport_show_history as show_history,
  b.passport_show_maintenance as show_maintenance,
  b.created_at,
  b.updated_at,
  p.id as owner_id,
  p.username as owner_username,
  p.display_name as owner_display_name,
  p.avatar_path as owner_avatar_path,
  (select count(*) from public.bookmarks bm where bm.bicycle_id = b.id)::integer as bookmark_count,
  exists (select 1 from public.bookmarks bm where bm.bicycle_id = b.id and bm.user_id = auth.uid()) as bookmarked_by_me,
  (select count(*) from public.bicycle_components bc where bc.bicycle_id = b.id)::integer as component_count
from public.bicycles b
join public.profiles p on p.id = b.owner_id
where b.visibility = 'public';

create view public.passport_components
with (security_invoker = false, security_barrier = true) as
select
  bc.id,
  bc.bicycle_id,
  bc.slot,
  bc.component_id,
  coalesce(c.name, bc.custom_name) as name,
  c.slug as component_slug,
  c.model,
  c.weight_g,
  c.material,
  c.verification_status,
  br.name as brand_name,
  cat.slug as category_slug,
  cat.name as category_name,
  case when b.passport_show_value then bc.price_paid end as price_paid,
  case when b.passport_show_value then coalesce(bc.currency, c.currency) end as currency,
  case when b.passport_show_value then c.price_reference end as price_reference,
  bc.installed_on
from public.bicycle_components bc
join public.bicycles b on b.id = bc.bicycle_id
left join public.components c on c.id = bc.component_id
left join public.component_brands br on br.id = c.brand_id
left join public.component_categories cat on cat.id = c.category_id
where b.visibility = 'public' and b.passport_show_components;

create view public.passport_revisions
with (security_invoker = false, security_barrier = true) as
select
  r.id,
  r.bicycle_id,
  r.revision_number,
  r.description,
  r.created_at,
  case when b.passport_show_value then r.changes
  else (
    select coalesce(jsonb_agg((ch #- '{from,price_paid}') #- '{to,price_paid}'), '[]'::jsonb)
    from jsonb_array_elements(r.changes) ch
  ) end as changes
from public.bicycle_build_revisions r
join public.bicycles b on b.id = r.bicycle_id
where b.visibility = 'public' and b.passport_show_history;

create view public.passport_maintenance
with (security_invoker = false, security_barrier = true) as
select
  m.id,
  m.bicycle_id,
  m.slot,
  m.maintenance_type,
  m.title,
  m.performed_on,
  m.distance_km,
  case when b.passport_show_value then m.cost end as cost,
  case when b.passport_show_value then m.currency end as currency
from public.maintenance_records m
join public.bicycles b on b.id = m.bicycle_id
where b.visibility = 'public' and b.passport_show_maintenance;

create view public.community_feed
with (security_invoker = false, security_barrier = true) as
select
  cp.id,
  cp.title,
  cp.body,
  cp.is_featured,
  cp.created_at,
  cp.updated_at,
  cp.author_id,
  a.username as author_username,
  a.display_name as author_display_name,
  a.avatar_path as author_avatar_path,
  -- Linked bicycle is only exposed while it is public.
  case when b.visibility = 'public' then b.id end as bicycle_id,
  case when b.visibility = 'public' then b.slug end as bicycle_slug,
  case when b.visibility = 'public' then b.name end as bicycle_name,
  case when b.visibility = 'public' then b.category end as bicycle_category,
  case when b.visibility = 'public' then b.brand end as bicycle_brand,
  case when b.visibility = 'public' then b.cover_image_path end as bicycle_cover_image_path,
  (select count(*) from public.post_likes l where l.post_id = cp.id)::integer as like_count,
  (select count(*) from public.post_comments c where c.post_id = cp.id and c.status = 'published')::integer as comment_count,
  exists (select 1 from public.post_likes l where l.post_id = cp.id and l.user_id = auth.uid()) as liked_by_me
from public.community_posts cp
join public.profiles a on a.id = cp.author_id
left join public.bicycles b on b.id = cp.bicycle_id
where cp.status = 'published';

create view public.profile_stats
with (security_invoker = false, security_barrier = true) as
select
  p.id,
  p.username,
  (select count(*) from public.user_follows f where f.following_id = p.id)::integer as follower_count,
  (select count(*) from public.user_follows f where f.follower_id = p.id)::integer as following_count,
  (select count(*) from public.bicycles b where b.owner_id = p.id and b.visibility = 'public')::integer as public_bicycle_count,
  (select count(*) from public.community_posts cp where cp.author_id = p.id and cp.status = 'published')::integer as post_count,
  exists (select 1 from public.user_follows f where f.following_id = p.id and f.follower_id = auth.uid()) as followed_by_me
from public.profiles p;

grant select on
  public.bicycle_passports, public.passport_components, public.passport_revisions,
  public.passport_maintenance, public.community_feed, public.profile_stats, public.component_catalog
to anon, authenticated;

-- =============================================================================
-- Storage
-- Paths: bicycle-media/{owner_id}/{bicycle_id}/{uuid}.{ext}
--        avatars/{user_id}/{uuid}.{ext}
--        maintenance-media/{owner_id}/{record_id}/{uuid}.{ext}
-- bicycle-media is PRIVATE: images of private bikes are never reachable; public
-- bikes' images are served via short-lived signed URLs.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('bicycle-media', 'bicycle-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('maintenance-media', 'maintenance-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "bicycle media readable by owner or for public bicycles" on storage.objects
  for select using (
    bucket_id = 'bicycle-media' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.bicycle_is_public(public.try_uuid((storage.foldername(name))[2]))
    )
  );
create policy "owners upload bicycle media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'bicycle-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.owns_bicycle(public.try_uuid((storage.foldername(name))[2]))
  );
create policy "owners delete bicycle media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'bicycle-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars are public" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "users upload own avatar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "users delete own avatar" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners read maintenance media" on storage.objects
  for select to authenticated using (
    bucket_id = 'maintenance-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "owners upload maintenance media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'maintenance-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "owners delete maintenance media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'maintenance-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
