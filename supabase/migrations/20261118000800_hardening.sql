-- =============================================================================
-- VELOX Digital Garage — Milestone 1: production hardening
--
-- 1. Database-enforced rate limits for community posts, comments and reports.
-- 2. Transactional storage-cleanup queue (orphaned object prevention).
-- 3. Avatar bucket: public URLs keep working, but objects can no longer be LISTED
--    by everyone (prevents enumerating every user's avatar folder).
-- 4. Component images: new/updated rows must use https (or a site-relative path).
--
-- Additive only: no table, column or data is dropped. The one DROP below removes
-- a storage *policy* and immediately replaces it with a narrower one.
-- =============================================================================

-- Internal schema: NOT exposed through the Data API (PostgREST only exposes the
-- schemas listed in the project's API settings, which default to public/graphql_public).
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

-- -----------------------------------------------------------------------------
-- 1. Rate limiting
-- -----------------------------------------------------------------------------
-- Enforced in the database because clients can reach PostgREST directly with the
-- anon key; a limit that only lives in Next.js server actions could be bypassed.
-- State lives in Postgres, so it is shared across all serverless instances.

create table private.rate_limit_rules (
  action          text not null,
  window_seconds  integer not null check (window_seconds > 0),
  max_events      integer not null check (max_events > 0),
  primary key (action, window_seconds)
);

insert into private.rate_limit_rules (action, window_seconds, max_events) values
  ('community_post',    600,   5),   -- 5 posts / 10 minutes
  ('community_post',    86400, 20),  -- 20 posts / day
  ('post_comment',      600,   20),  -- 20 comments / 10 minutes
  ('post_comment',      86400, 200), -- 200 comments / day
  ('content_report',    3600,  10),  -- 10 reports / hour
  ('content_report',    86400, 30)   -- 30 reports / day
on conflict do nothing;

create table private.rate_limit_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  action      text not null,
  created_at  timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on private.rate_limit_events (user_id, action, created_at);

create or replace function private.enforce_rate_limit(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rule record;
  v_count integer;
  v_max_window integer;
begin
  -- Trusted server-side writes (service role, migrations, seeds) have no end-user identity.
  if v_uid is null then
    return;
  end if;

  -- Serialise concurrent requests from the same user for this action so two
  -- parallel inserts cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_action, 0));

  for v_rule in
    select window_seconds, max_events from private.rate_limit_rules where action = p_action
  loop
    select count(*) into v_count
    from private.rate_limit_events
    where user_id = v_uid
      and action = p_action
      and created_at > now() - make_interval(secs => v_rule.window_seconds);
    if v_count >= v_rule.max_events then
      -- PostgREST maps SQLSTATE PTxyz to HTTP status xyz → 429 Too Many Requests.
      raise exception 'Rate limit exceeded for %', p_action
        using errcode = 'PT429',
              hint = format('Limit: %s per %s seconds', v_rule.max_events, v_rule.window_seconds);
    end if;
  end loop;

  insert into private.rate_limit_events (user_id, action) values (v_uid, p_action);

  -- Opportunistic housekeeping for this user/action: keep only the longest window.
  select coalesce(max(window_seconds), 86400) into v_max_window
  from private.rate_limit_rules where action = p_action;
  delete from private.rate_limit_events
  where user_id = v_uid
    and action = p_action
    and created_at < now() - make_interval(secs => v_max_window);
end;
$$;

create or replace function private.rate_limit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit(tg_argv[0]);
  return new;
end;
$$;

create trigger community_posts_rate_limit
  before insert on public.community_posts
  for each row execute function private.rate_limit_trigger('community_post');
create trigger post_comments_rate_limit
  before insert on public.post_comments
  for each row execute function private.rate_limit_trigger('post_comment');
create trigger content_reports_rate_limit
  before insert on public.content_reports
  for each row execute function private.rate_limit_trigger('content_report');

-- -----------------------------------------------------------------------------
-- 2. Storage cleanup queue
-- -----------------------------------------------------------------------------
-- Storage objects are not part of the database transaction. Instead of deleting
-- files before rows (old behaviour: a later failure left rows pointing at missing
-- files) rows are deleted first and triggers enqueue the affected objects in the
-- SAME transaction. Workers (the user's own session right after the action, and a
-- scheduled job with the service role) then remove the objects and record the
-- outcome. Every job is confined to its owner's folder by CHECK constraints.

create table private.storage_cleanup_jobs (
  id               bigint generated always as identity primary key,
  bucket           text not null check (bucket in ('bicycle-media', 'maintenance-media', 'avatars')),
  owner_id         uuid not null, -- no FK: jobs must survive deletion of the user
  object_path      text,
  prefix           text,
  reason           text not null,
  status           text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts         integer not null default 0,
  last_error       text,
  next_attempt_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  constraint storage_cleanup_target check ((object_path is null) <> (prefix is null)),
  -- A single object inside the owner's top-level folder. No traversal, no empty segments.
  constraint storage_cleanup_path_scope check (
    object_path is null or (
      starts_with(object_path, owner_id::text || '/')
      and object_path !~ '(^|/)\.\.?(/|$)'
      and object_path !~ '//'
      and length(object_path) <= 512
    )
  ),
  -- A whole sub-folder: exactly "<owner uuid>/<entity uuid>/".
  constraint storage_cleanup_prefix_scope check (
    prefix is null or prefix ~ ('^' || owner_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/$')
  )
);
create unique index storage_cleanup_pending_unique
  on private.storage_cleanup_jobs (bucket, (coalesce(object_path, prefix)))
  where status = 'pending';
create index storage_cleanup_due_idx on private.storage_cleanup_jobs (next_attempt_at) where status = 'pending';
create index storage_cleanup_owner_idx on private.storage_cleanup_jobs (owner_id) where status = 'pending';

create or replace function private.enqueue_storage_cleanup(p_bucket text, p_owner uuid, p_path text, p_prefix text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner is null or (p_path is null and p_prefix is null) then
    return;
  end if;
  -- Never let a malformed legacy path abort the user's delete: skip it loudly instead.
  if p_path is not null and not starts_with(p_path, p_owner::text || '/') then
    raise warning 'storage cleanup skipped: % is outside the owner folder', p_path;
    return;
  end if;
  insert into private.storage_cleanup_jobs (bucket, owner_id, object_path, prefix, reason)
  values (p_bucket, p_owner, p_path, p_prefix, p_reason)
  on conflict (bucket, (coalesce(object_path, prefix))) where status = 'pending' do nothing;
end;
$$;

create or replace function private.storage_cleanup_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case tg_table_name
    when 'bicycles' then
      perform private.enqueue_storage_cleanup('bicycle-media', old.owner_id, null, old.owner_id::text || '/' || old.id::text || '/', 'bicycle_deleted');
    when 'maintenance_records' then
      perform private.enqueue_storage_cleanup('maintenance-media', old.owner_id, null, old.owner_id::text || '/' || old.id::text || '/', 'maintenance_record_deleted');
    when 'bicycle_images' then
      -- When the whole bicycle is being deleted (cascade), the folder job covers it.
      if exists (select 1 from public.bicycles where id = old.bicycle_id) then
        perform private.enqueue_storage_cleanup('bicycle-media', old.owner_id, old.storage_path, null, 'bicycle_image_deleted');
      end if;
    when 'maintenance_photos' then
      if exists (select 1 from public.maintenance_records where id = old.record_id) then
        perform private.enqueue_storage_cleanup('maintenance-media', old.owner_id, old.storage_path, null, 'maintenance_photo_deleted');
      end if;
    when 'profiles' then
      perform private.enqueue_storage_cleanup('avatars', old.id, old.avatar_path, null, 'profile_deleted');
  end case;
  return old;
end;
$$;

create trigger bicycles_storage_cleanup after delete on public.bicycles
  for each row execute function private.storage_cleanup_on_delete();
create trigger maintenance_records_storage_cleanup after delete on public.maintenance_records
  for each row execute function private.storage_cleanup_on_delete();
create trigger bicycle_images_storage_cleanup after delete on public.bicycle_images
  for each row execute function private.storage_cleanup_on_delete();
create trigger maintenance_photos_storage_cleanup after delete on public.maintenance_photos
  for each row execute function private.storage_cleanup_on_delete();
create trigger profiles_storage_cleanup after delete on public.profiles
  for each row execute function private.storage_cleanup_on_delete();

create or replace function private.storage_cleanup_on_avatar_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.avatar_path is not null and old.avatar_path is distinct from new.avatar_path then
    perform private.enqueue_storage_cleanup('avatars', old.id, old.avatar_path, null, 'avatar_replaced');
  end if;
  return new;
end;
$$;

create trigger profiles_avatar_storage_cleanup after update of avatar_path on public.profiles
  for each row execute function private.storage_cleanup_on_avatar_change();

-- Worker API -------------------------------------------------------------------
-- Callers: an authenticated user (processes ONLY their own jobs) or the service
-- role (scheduled worker, processes everything). Anonymous callers are rejected.

create or replace function private.cleanup_caller_is_service()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.claim_storage_cleanup_jobs(p_limit integer default 25)
returns table (id bigint, bucket text, object_path text, prefix text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_service boolean := private.cleanup_caller_is_service();
  v_uid uuid := auth.uid();
begin
  if not v_service and v_uid is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with due as (
    select j.id
    from private.storage_cleanup_jobs j
    where j.status = 'pending'
      and j.next_attempt_at <= now()
      and (v_service or j.owner_id = v_uid)
    order by j.next_attempt_at, j.id
    limit greatest(1, least(coalesce(p_limit, 25), 200))
    for update skip locked
  )
  update private.storage_cleanup_jobs j
     set attempts = j.attempts + 1,
         -- Lease: if the worker dies, the job becomes due again after 10 minutes.
         next_attempt_at = now() + interval '10 minutes',
         updated_at = now()
    from due
   where j.id = due.id
  returning j.id, j.bucket, j.object_path, j.prefix, j.attempts;
end;
$$;

create or replace function public.finish_storage_cleanup_job(p_id bigint, p_error text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service boolean := private.cleanup_caller_is_service();
  v_uid uuid := auth.uid();
  v_job private.storage_cleanup_jobs;
  v_max_attempts constant integer := 8;
begin
  if not v_service and v_uid is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_job from private.storage_cleanup_jobs where id = p_id for update;
  if not found or (not v_service and v_job.owner_id is distinct from v_uid) then
    raise exception 'Cleanup job not found' using errcode = '42501';
  end if;
  if v_job.status <> 'pending' then
    return v_job.status;
  end if;

  if p_error is null then
    update private.storage_cleanup_jobs
       set status = 'done', last_error = null, completed_at = now(), updated_at = now()
     where id = p_id;
    return 'done';
  end if;

  update private.storage_cleanup_jobs
     set status = case when v_job.attempts >= v_max_attempts then 'failed' else 'pending' end,
         last_error = left(p_error, 500),
         -- Exponential backoff: 2, 4, 8 … minutes, capped at 12 hours.
         next_attempt_at = now() + least(make_interval(mins => power(2, v_job.attempts)::integer), interval '12 hours'),
         updated_at = now()
   where id = p_id;
  return case when v_job.attempts >= v_max_attempts then 'failed' else 'pending' end;
end;
$$;

-- Used by server actions when an immediate compensating delete fails (e.g. an
-- upload succeeded but the database insert did not). Users may only schedule
-- objects inside their own folder.
create or replace function public.request_storage_cleanup(p_bucket text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_bucket not in ('bicycle-media', 'maintenance-media', 'avatars') or not starts_with(coalesce(p_path, ''), v_uid::text || '/') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.enqueue_storage_cleanup(p_bucket, v_uid, p_path, null, 'compensation');
end;
$$;

-- Requeue permanently failed jobs (operator action, service role only).
create or replace function public.retry_failed_storage_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.cleanup_caller_is_service() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update private.storage_cleanup_jobs
     set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()
   where status = 'failed'
     and not exists (
       select 1 from private.storage_cleanup_jobs p
       where p.status = 'pending' and p.bucket = storage_cleanup_jobs.bucket
         and coalesce(p.object_path, p.prefix) = coalesce(storage_cleanup_jobs.object_path, storage_cleanup_jobs.prefix)
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Lock down: nothing in `private` is reachable by API roles; worker functions are
-- callable only by signed-in users and the service role.
revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.claim_storage_cleanup_jobs(integer) from public, anon;
revoke all on function public.finish_storage_cleanup_job(bigint, text) from public, anon;
revoke all on function public.request_storage_cleanup(text, text) from public, anon;
revoke all on function public.retry_failed_storage_cleanup() from public, anon, authenticated;
grant execute on function public.claim_storage_cleanup_jobs(integer) to authenticated, service_role;
grant execute on function public.finish_storage_cleanup_job(bigint, text) to authenticated, service_role;
grant execute on function public.request_storage_cleanup(text, text) to authenticated;
grant execute on function public.retry_failed_storage_cleanup() to service_role;

-- -----------------------------------------------------------------------------
-- 3. Avatars: serve publicly, do not allow listing
-- -----------------------------------------------------------------------------
-- A public bucket serves objects at /object/public/... WITHOUT consulting RLS, so
-- avatar URLs keep working. The old SELECT-for-everyone policy additionally let any
-- client LIST the bucket and enumerate every user's folder; owners keep read access
-- to their own folder (needed by the Storage API when they replace/remove files).
drop policy if exists "avatars are public" on storage.objects;
create policy "users read own avatar objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 4. Component images: https only for new data
-- -----------------------------------------------------------------------------
-- NOT VALID: enforced for every new or updated row without rewriting/validating
-- existing data (safe to apply to a populated database).
alter table public.component_images
  add constraint component_images_url_https check (url ~ '^(https://|/[^/])') not valid;
