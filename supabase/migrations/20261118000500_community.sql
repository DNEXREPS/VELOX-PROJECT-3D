-- =============================================================================
-- VELOX Digital Garage — 0500 Community
-- Posts, likes, comments, follows, bookmarks, content reports & moderation.
-- =============================================================================

create type public.content_status as enum ('published', 'hidden', 'removed');
create type public.report_target as enum ('post', 'comment', 'bicycle', 'profile');
create type public.report_reason as enum ('spam', 'harassment', 'inappropriate', 'misleading', 'stolen_property', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  bicycle_id   uuid references public.bicycles (id) on delete set null,
  title        text not null constraint posts_title_len check (char_length(btrim(title)) between 1 and 140),
  body         text not null default '' constraint posts_body_len check (char_length(body) <= 10000),
  status       public.content_status not null default 'published',
  is_featured  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index posts_feed_idx on public.community_posts (created_at desc) where status = 'published';
create index posts_author_idx on public.community_posts (author_id, created_at desc);
create index posts_bicycle_idx on public.community_posts (bicycle_id);

create trigger community_posts_set_updated_at
  before update on public.community_posts
  for each row execute function public.set_updated_at();

-- A post may only link a bicycle that its author owns and that is public.
create or replace function public.enforce_post_bicycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bicycle_id is not null and not exists (
    select 1 from public.bicycles
    where id = new.bicycle_id and owner_id = new.author_id and visibility = 'public'
  ) then
    raise exception 'linked bicycle must be public and owned by the author' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger community_posts_bicycle_check
  before insert or update of bicycle_id on public.community_posts
  for each row execute function public.enforce_post_bicycle();

create table public.post_likes (
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);

create table public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null constraint comments_body_len check (char_length(btrim(body)) between 1 and 2000),
  status      public.content_status not null default 'published',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();

create table public.user_follows (
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  following_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_not_self check (follower_id <> following_id)
);
create index user_follows_following_idx on public.user_follows (following_id);

create table public.bookmarks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  bicycle_id  uuid not null references public.bicycles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, bicycle_id)
);
create index bookmarks_bicycle_idx on public.bookmarks (bicycle_id);

create table public.content_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  target_type      public.report_target not null,
  target_id        uuid not null,
  reason           public.report_reason not null,
  details          text constraint reports_details_len check (char_length(details) <= 1000),
  status           public.report_status not null default 'open',
  resolution_note  text constraint reports_note_len check (char_length(resolution_note) <= 1000),
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint reports_unique_per_reporter unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.content_reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.post_is_visible(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.community_posts where id = p_post_id and status = 'published');
$$;

-- ---------------------------------------------------------------------------
-- Moderation (SECURITY DEFINER, moderator-gated)
-- ---------------------------------------------------------------------------
create or replace function public.moderate_content(
  p_target_type public.report_target,
  p_target_id uuid,
  p_status public.content_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'moderator role required' using errcode = 'insufficient_privilege';
  end if;
  if p_target_type = 'post' then
    update public.community_posts set status = p_status where id = p_target_id;
  elsif p_target_type = 'comment' then
    update public.post_comments set status = p_status where id = p_target_id;
  elsif p_target_type = 'bicycle' then
    -- Moderators can only take a bicycle out of public view; they never see private fields.
    if p_status <> 'published' then
      update public.bicycles set visibility = 'private' where id = p_target_id;
    end if;
  else
    raise exception 'unsupported target' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

create or replace function public.set_post_featured(p_post_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'moderator role required' using errcode = 'insufficient_privilege';
  end if;
  update public.community_posts set is_featured = p_featured where id = p_post_id;
end;
$$;

create or replace function public.resolve_report(
  p_report_id uuid,
  p_status public.report_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'moderator role required' using errcode = 'insufficient_privilege';
  end if;
  update public.content_reports
     set status = p_status,
         resolution_note = left(p_note, 1000),
         resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
   where id = p_report_id;
end;
$$;

revoke execute on function public.moderate_content(public.report_target, uuid, public.content_status) from public, anon;
revoke execute on function public.set_post_featured(uuid, boolean) from public, anon;
revoke execute on function public.resolve_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.moderate_content(public.report_target, uuid, public.content_status) to authenticated;
grant execute on function public.set_post_featured(uuid, boolean) to authenticated;
grant execute on function public.resolve_report(uuid, public.report_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.community_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.user_follows enable row level security;
alter table public.bookmarks enable row level security;
alter table public.content_reports enable row level security;

-- Posts
create policy "published posts are public" on public.community_posts
  for select using (status = 'published' or author_id = auth.uid() or public.is_moderator());
create policy "authors create posts" on public.community_posts
  for insert to authenticated with check (author_id = auth.uid() and status = 'published' and is_featured = false);
create policy "authors edit their posts" on public.community_posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors or moderators delete posts" on public.community_posts
  for delete to authenticated using (author_id = auth.uid() or public.is_moderator());

revoke all on public.community_posts from anon;
grant select on public.community_posts to anon;
revoke update on public.community_posts from authenticated;
grant update (title, body, bicycle_id) on public.community_posts to authenticated;

-- Likes
create policy "likes are public" on public.post_likes for select using (true);
create policy "users like visible posts" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid() and public.post_is_visible(post_id));
create policy "users remove their likes" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.post_likes from anon;
revoke update on public.post_likes from authenticated;

-- Comments
create policy "published comments on visible posts are public" on public.post_comments
  for select using (
    (status = 'published' and public.post_is_visible(post_id))
    or author_id = auth.uid()
    or public.is_moderator()
  );
create policy "users comment on visible posts" on public.post_comments
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'published' and public.post_is_visible(post_id));
create policy "authors edit comments" on public.post_comments
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors or moderators delete comments" on public.post_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_moderator());
revoke insert, update, delete on public.post_comments from anon;
revoke update on public.post_comments from authenticated;
grant update (body) on public.post_comments to authenticated;

-- Follows
create policy "follows are public" on public.user_follows for select using (true);
create policy "users follow" on public.user_follows
  for insert to authenticated with check (follower_id = auth.uid());
create policy "users unfollow" on public.user_follows
  for delete to authenticated using (follower_id = auth.uid());
revoke insert, update, delete on public.user_follows from anon;
revoke update on public.user_follows from authenticated;

-- Bookmarks (private to the user; aggregate counts are exposed via views)
create policy "users read their bookmarks" on public.bookmarks
  for select to authenticated using (user_id = auth.uid());
create policy "users bookmark public or own bicycles" on public.bookmarks
  for insert to authenticated
  with check (user_id = auth.uid() and (public.bicycle_is_public(bicycle_id) or public.owns_bicycle(bicycle_id)));
create policy "users remove bookmarks" on public.bookmarks
  for delete to authenticated using (user_id = auth.uid());
revoke all on public.bookmarks from anon;
revoke update on public.bookmarks from authenticated;

-- Reports
create policy "reporters and moderators read reports" on public.content_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());
create policy "users file reports" on public.content_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and resolved_by is null and resolved_at is null);
revoke all on public.content_reports from anon;
revoke update, delete on public.content_reports from authenticated;
