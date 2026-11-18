# VELOX Digital Garage — Architecture

## Project structure

```
src/
  app/                      Routes (App Router). Pages are thin: load data, compose features.
    (auth)/                 /login /register /forgot-password /reset-password
    (app)/                  Authenticated area (dashboard, garage/**, settings, moderation)
    api/studio/candidates   JSON endpoint for the studio component picker (TanStack Query)
    auth/callback           Email confirmation / recovery (PKCE + token-hash)
    bike/[username]/[slug]  Digital Bike Passport (public)
    community, explore, components, profile
  components/ui             shadcn-style primitives (Radix), tight radii, graphite tokens
  components/common|layout  Shared presentational components, header/footer
  features/<domain>/        Feature UI: auth, garage, studio, components, community, history,
                            maintenance, analytics, settings, landing
  features/studio/three/    3D ENGINE — React Three Fiber scene, model loading, camera, 2D fallback
  features/studio/models/   3D MODEL METADATA — explicit mesh→slot mapping per GLB
  lib/                      Framework-free logic (unit-tested):
    compatibility/          attribute registry, rules, engine
    analytics/              weight, cost, drivetrain, gear table, provenance
    maintenance.ts          reminders, cost summaries
    configuration.ts        studio pending model, RPC payload builder, snapshot diff
    validation/             Zod schemas (forms + server actions + catalogue files)
    domain/                 slots, enums (kept in sync with SQL by tests)
    supabase/               server/browser clients
    security/               CSP builder, image-host allow-list, bearer check
    monitoring/             scrubbed structured events (server) + browser beacons
    storage-cleanup.ts      cleanup worker logic (pagination, scope checks)
  server/                   Server-only: auth (session DAL), queries/, actions/ (Server Actions), storage
  types/                    database.ts (generated), domain.ts
  proxy.ts                  Per-request CSP nonce, session refresh, route gating (Next 16 "proxy")
  instrumentation.ts        Server error capture (onRequestError → monitoring)
supabase/
  migrations/               Version-controlled SQL (0100 → 0800), additive only (guarded by a unit test)
  templates/                Auth e-mail templates (token-hash links)
  catalog/                  categories.json + demo-catalog.json (source for seed.sql)
  seed.sql                  Generated — categories + clearly labelled demo catalogue
  tests/supabase-shim.sql   Minimal auth/storage/roles shim for vanilla Postgres tests
scripts/                    seed builder, catalogue import CLI, GLB generator, local DB helper
tests/unit · tests/db · tests/e2e
```

Rendering logic (`features/studio/three`) never imports business logic; it receives display state (selected / pending / recorded slots, paint colour, tire widths) and emits slot selections. The studio orchestrator (`features/studio/components/studio-client.tsx`) owns state and calls pure functions in `lib/`.

## Data model

| Table | Notes |
| --- | --- |
| `profiles` | 1:1 with `auth.users`, created by trigger. `role` (user/moderator/admin) is not client-writable (column grants). |
| `bicycles` | Owner-only RLS. Passport toggles (`passport_show_*`), `model_key` → 3D registry, partial unique index = one primary bike per owner. |
| `bicycle_private_details` | Serial number, purchase price/date, private notes. Owner-only; no public read path exists. |
| `bicycle_images` | Storage paths `bicycle-media/{owner}/{bike}/{uuid}.ext`. |
| `component_categories` / `component_brands` / `components` | Registry. `components.verification_status` ∈ demo / user_submitted / community_verified / manufacturer_verified (the last requires `source_url`). |
| `component_specifications` | Key/label/value(+unit) with `source` provenance. Absent = unknown. |
| `component_compatibility_rules` | Per-component **interface attributes** (e.g. `bb_shell = bsa_68`, `freehub_bodies = {shimano_hg}`). The rules that compare them live in `src/lib/compatibility/rules.ts`. |
| `bicycle_components` | Current configuration, unique per (bicycle, slot). **No client write privileges.** |
| `bicycle_builds` / `bicycle_build_revisions` | Revisions are append-only (trigger blocks UPDATE), store previous/new snapshots + diff, `created_by`. |
| `maintenance_records` / `maintenance_photos` | Owner-only. Distance & cost optional. Check constraints for dates and currencies. |
| `community_posts`, `post_likes`, `post_comments`, `user_follows`, `bookmarks`, `content_reports` | Community. Status (`published/hidden/removed`) for moderation. |

Internal (schema `private`, not exposed through the Data API): `rate_limit_rules`, `rate_limit_events`, `storage_cleanup_jobs`.

Public read models (views): `bicycle_passports`, `passport_components`, `passport_revisions`, `passport_maintenance`, `community_feed`, `profile_stats`, `component_catalog`.

## Security model

1. **RLS on every table.** Base garage tables are readable only by their owner.
2. **Public access goes through masked views** that run with the owner's privileges (`security_invoker = false`) and filter `visibility = 'public'` themselves, masking value/weight/prices according to the passport toggles. Never-public columns are not selected at all.
3. **Column-level grants** stop clients changing `owner_id`, `role`, `is_featured`, `status`, `created_by`, `verification_status` escalation (policy `WITH CHECK`) etc. (Note: Postgres requires table-level REVOKE + column GRANT; a column-level REVOKE alone has no effect.)
4. **Configuration writes only via `apply_bicycle_configuration()`** (SECURITY DEFINER, explicit `auth.uid()` ownership check, slot/category validation, atomic snapshot + diff + revision). Nobody can rewrite history.
5. **Child-row ownership triggers** (`enforce_child_owner`) reject spoofed `owner_id`.
6. **Server Actions** re-validate with Zod, resolve the user via `auth.getUser()` (JWT verified by Supabase Auth) — client-supplied user ids are never trusted. Errors are mapped to safe messages (`fromDbError`).
7. **Uploads**: server-side size limits + magic-byte type detection (not the client MIME), random object names, bucket MIME/size limits, storage RLS by folder ownership. `bicycle-media` is private: images of private bikes are unreachable; public bikes' images use short-lived signed URLs.
8. **Moderation**: SECURITY DEFINER functions gated by `is_moderator()`; reports are visible only to reporter + moderators.
9. **Service-role key**: read only by `src/server/supabase-admin.ts` (`server-only`). It is imported only by the scheduled cleanup route, which requires `Authorization: Bearer $CRON_SECRET` (constant-time comparison). A static test enforces this.
10. **Content Security Policy** (proxy.ts):
    - Scripts: per-request nonce + `'strict-dynamic'`, no `unsafe-inline` and no `unsafe-eval` in production. Zod runs in jitless mode so it never probes `new Function`.
    - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
    - Images: self, data/blob, the Supabase project and allow-listed hosts.

    Other headers: HSTS, COOP and CORP `same-origin`, `nosniff`, `X-Frame-Options: DENY`, Permissions-Policy and `Cache-Control: no-store` on `/api/*`.
11. **Rate limits** (posts 5/10 min and 20/day, comments 20/10 min and 200/day, reports 10/h and 30/day) are enforced by `BEFORE INSERT` triggers in Postgres. They therefore cover direct PostgREST calls as well as the app, and hold across serverless instances. They are serialised per user with an advisory lock and return SQLSTATE `PT429`, which PostgREST maps to HTTP 429.
12. **Uploads** (in addition to point 7):
    - The header is parsed for pixel dimensions; images over 8000 px per side or 40 MP are rejected (decompression-bomb protection).
    - Avatars are served by public URL, but the bucket can no longer be listed anonymously.
    - Component image URLs must be `https` (or site-relative) and are rendered only from allow-listed hosts, with `referrerpolicy=no-referrer`.
13. Open-redirect protection on `next` parameters.

Verified by:
- `tests/db/rls.test.ts` (26 cases) and `tests/db/hardening.test.ts` (22 cases), against both a vanilla Postgres 16 + shim and the real Supabase local stack.
- `tests/e2e/security.e2e.mjs` (14 checks) against a production build.

## Compatibility engine

`checkCompatibility(candidate, installedParts, rules?)` evaluates every rule whose slot pair matches. Each rule relates attribute A (on slots X) to attribute B (on slots Y) with `equal`, `a_in_b`, `b_in_a` or `a_lte_b`.

- any failing rule → **incompatible** (with explanation)
- any rule lacking data on either side, **or no applicable rule at all** → **unknown / requires verification**
- otherwise → **compatible**

Matching categories never imply compatibility. Manufacturer-specific logic can be added as more rules or a custom rule set passed to the engine; adapters (e.g. post-mount ↔ flat-mount) are deliberately reported as incompatible with an explanation that adapters require verification.

## Architecture decisions (ADRs)

**ADR-001 Supabase + Server Actions, not a separate API.** Data access happens on the server with the user's session; RLS is the source of truth, server code adds validation and UX-level checks. A single JSON route exists where the client needs interactive fetching (studio picker).

**ADR-002 Cache Components disabled.** Next 16 enables Cache Components by default in new apps, which requires every cookie read to sit behind Suspense or the build fails. Nearly every route here is per-user and cookie-dependent, so the request-time rendering model is used. Revisit if public pages (explore, passports) need edge caching — they can adopt `use cache` with the passport id as key.

**ADR-003 Privacy by structure.** Sensitive fields are split into an owner-only table instead of relying on column filtering in queries. Public reads use dedicated views. This makes accidental leaks through a new query impossible rather than unlikely.

**ADR-004 History is a database invariant.** Revisions are written by the same transaction that changes the configuration, inside a SECURITY DEFINER function; there is no client write path to either table.

**ADR-005 Compatibility = attributes in DB, rules in code.** Attributes are data (per component, sourced, editable); rules are reviewed, tested code. This keeps rules testable and versioned while letting the catalogue grow.

**ADR-006 Explicit 3D metadata.** Mesh names are never assumed. Each GLB has a metadata module mapping slots → mesh names, focus points, camera presets and visual capabilities; a unit test checks the mapping against the asset file.

**ADR-007 Honest placeholders.** The placeholder model, demo catalogue and data-only replacements are labelled in the UI. No fabricated community content, mileage, or specifications.

**ADR-008 Proxy (middleware) is a convenience gate.** `src/proxy.ts` refreshes sessions and redirects anonymous users from protected routes; pages and actions re-check the session, and RLS enforces access regardless.

**ADR-009 Rate limits live in the database.** Clients can reach PostgREST directly with the public key, so a limit in Server Actions alone is bypassable, and in-memory counters do not work on serverless. Triggers on the community tables record events in `private.rate_limit_events`. Limits are rows in `private.rate_limit_rules`, adjustable without a deploy.

**ADR-010 Storage cleanup is a transactional outbox.**
- Rows are deleted first. Triggers enqueue the affected objects or entity folders in `private.storage_cleanup_jobs` in the same transaction, so a failed delete enqueues nothing and a committed delete always leaves a job.
- Workers claim jobs (`claim_storage_cleanup_jobs`: lease, `SKIP LOCKED`) and report back (`finish_storage_cleanup_job`: done, or retry with exponential backoff, then `failed` after 8 attempts).
- There are two workers:
  - the user's own session, right after the action (`after()`), limited to their own jobs;
  - the daily Vercel Cron route with the service role.
- CHECK constraints confine every job to `<owner>/…`, and folder jobs to exactly `<owner>/<uuid>/`. The worker re-checks each listed path before removing it. Listing is paginated and recursive, so folders over 1,000 objects are handled.

**ADR-011 Vendor-neutral monitoring.** Events are scrubbed JSON lines on stderr (Vercel Logs and Log Drains to any provider), with an optional webhook. No SDK in the client bundle. The scrubber removes tokens, keys, emails, URL secrets, sensitive keys (serial, purchase, notes …) and Postgres value echoes. Call sites pass operation names and IDs, never form data.

## Known gaps / next steps

- **Production 3D assets**: only the procedural placeholder exists (see `docs/3d-assets.md`). Visual replacement beyond tire width needs modular assets.
- **Real component data**: the importer and provenance model are ready; a sourced dataset (with licences) is not included.
- **Multiple builds per bicycle**: the schema has `bicycle_builds` with one active build; UI for alternate builds (e.g. winter setup) is not built.
- **Rate limiting** covers posts, comments and reports (DB-enforced). Likes, follows, bookmarks, component submissions and uploads rely on Supabase's platform limits only.
- **Notifications** (maintenance due emails, comment notifications) are not implemented.
- **Full-text search** uses `ILIKE`; add `pg_trgm` indexes when the catalogue grows.
- **Image processing** (resizing/thumbnails) is not implemented; originals ≤ 5 MB are served via signed URLs.
- **CSP `style-src` allows `'unsafe-inline'`** (inline `style` attributes from React/Radix/Recharts cannot carry nonces). Script execution remains strictly nonce-based.
- **Orphan sweep**: uploads whose database row was never written are removed when their folder is deleted, or when compensation is queued. There is no periodic reconciliation of storage against tables.
- **Monitoring** has no alerting until a Log Drain or `MONITORING_WEBHOOK_URL` is configured (see `docs/deployment/staging.md`).
