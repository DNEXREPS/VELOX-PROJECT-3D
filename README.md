# VELOX Digital Garage

**Bike digital twin & cycling community platform.**
Every bicycle has a digital identity. Every component has a record. Every modification has a history.

Riders register bicycles, record their components in an interactive 3D studio with a structured compatibility engine, track maintenance and analytics, keep an immutable build history, and publish a shareable **Digital Bike Passport**.

| Area | What it does |
| --- | --- |
| **Garage** | Multiple bicycles, photos, primary bike, public/private, owner-only serial & purchase data |
| **3D Studio** | GLB viewer (orbit/zoom/pan, presets, fullscreen), mesh selection, replacement preview with compatibility checks, confirm → immutable revision |
| **Component registry** | Search, category/brand filters, sorting, pagination, detail pages, rider submissions, provenance on every value |
| **Compatibility engine** | 27 data-driven rules → `compatible` / `incompatible` / `unknown (requires verification)` |
| **Build history** | Append-only revisions with full before/after snapshots, revision inspector |
| **Maintenance & analytics** | Service log with photos, reminders, cost summaries; weight, cost, gearing, wheel data with provenance labels |
| **Community** | Profiles, explore, posts linked to passports, likes, comments, follows, bookmarks, reports, moderation queue |

---

## Quick start (local, full stack)

Requirements: Node ≥ 20.9, Docker (for the Supabase CLI).

```bash
npm install
npx supabase start            # Postgres, Auth, REST, Storage — applies migrations + seed
cp .env.example .env.local    # then set the URL + anon key printed by `supabase start`
npm run dev                   # http://localhost:3000
```

`supabase start` prints `API_URL` and `ANON_KEY`; put them in `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Email confirmation is disabled locally (`supabase/config.toml`), so registration signs you in immediately.

Without Supabase variables the app still builds and renders: every data page shows an explicit **“Backend not configured”** notice instead of fake data.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Anon / publishable key (RLS enforces access) |
| `NEXT_PUBLIC_SITE_URL` | server | Origin for auth email redirects and share links |
| `SUPABASE_SERVICE_ROLE_KEY` | **CLI only** | Used by `npm run catalog:import`; never read by the web app |
| `DATABASE_URL` | tests only | Postgres URL for the RLS integration suite |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `npm run lint` | `tsc --noEmit` · ESLint |
| `npm test` | Unit tests (compatibility, analytics, maintenance, revisions, validation, uploads, 3D asset mapping, schema sync) |
| `npm run db:local` then `DATABASE_URL=… npm run test:db` | Throwaway Postgres 16 + Supabase shim → migrations + seed → RLS/ownership/integrity suite |
| `node tests/e2e/journey.e2e.mjs [baseUrl]` | Playwright end-to-end journey against a running app + local Supabase |
| `npm run check` | typecheck + lint + unit tests + production build |
| `npm run db:seed:build` | Regenerate `supabase/seed.sql` from `supabase/catalog/*.json` |
| `npm run catalog:import -- file.json` | Import a real, sourced catalogue (service role) |
| `npm run model:generate` | Regenerate the placeholder GLB |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local Supabase schema |

## Deployment (Vercel + Supabase)

1. Create a Supabase project; `npx supabase link` then `npx supabase db push` (applies `supabase/migrations`). Load categories + the demo catalogue with `supabase/seed.sql` if wanted.
2. In Supabase Auth settings, set the Site URL and add `https://<your-domain>/auth/callback` as a redirect URL.
3. On Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
4. To make a moderator: `update public.profiles set role = 'moderator' where username = '…';` (SQL editor / service role).

## Data honesty

- The bundled catalogue is **demo data**: fictional parts under the brands “VELOX Demo Parts / Works”, `verification_status = 'demo'`, labelled “Demo data” everywhere. No manufacturer specifications are invented.
- Unknown values stay `null` and render as **Unavailable**. Analytics report partial coverage instead of extrapolating; currencies are never converted.
- The 3D model is a **procedurally generated placeholder** and is labelled as such. Replacements that the model cannot represent are shown as *data-only*; only tire width is a real parametric preview (from the component’s `tire_width_mm`).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — structure, data model, security model, decisions (ADRs), known gaps
- [`docs/3d-assets.md`](docs/3d-assets.md) — 3D asset requirements and how to add production models
