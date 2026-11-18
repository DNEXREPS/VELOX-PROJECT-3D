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
  server/                   Server-only: auth (session DAL), queries/, actions/ (Server Actions), storage
  types/                    database.ts (generated), domain.ts
  proxy.ts                  Session refresh + route gating (Next 16 "proxy", formerly middleware)
supabase/
  migrations/               Version-controlled SQL (0100 → 0700)
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
9. No service-role key in the web app. Open-redirect protection on `next` parameters. Security headers in `next.config.ts`.

Verified by `tests/db/rls.test.ts` (26 cases) against both a vanilla Postgres 16 + shim and the real Supabase local stack.

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

## Known gaps / next steps

- **Production 3D assets**: only the procedural placeholder exists (see `docs/3d-assets.md`). Visual replacement beyond tire width needs modular assets.
- **Real component data**: the importer and provenance model are ready; a sourced dataset (with licences) is not included.
- **Multiple builds per bicycle**: the schema has `bicycle_builds` with one active build; UI for alternate builds (e.g. winter setup) is not built.
- **Rate limiting** relies on Supabase Auth limits; app-level limits for community actions (posting/reporting) are not implemented.
- **Notifications** (maintenance due emails, comment notifications) are not implemented.
- **Full-text search** uses `ILIKE`; add `pg_trgm` indexes when the catalogue grows.
- **Image processing** (resizing/thumbnails) is not implemented; originals ≤ 5 MB are served via signed URLs.
- **Content-Security-Policy** header is not yet configured.
