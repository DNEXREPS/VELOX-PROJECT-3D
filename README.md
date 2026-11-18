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
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Scheduled storage cleanup route (`server-only` module) and `npm run catalog:import`. Never exposed to the browser |
| `CRON_SECRET` | server only | Bearer secret Vercel Cron sends to `/api/cron/storage-cleanup` (≥ 32 chars) |
| `IMAGE_HOSTS_ALLOWLIST` | server | Optional comma-separated hosts for external component images (CSP + rendering) |
| `MONITORING_WEBHOOK_URL` / `_TOKEN` | server | Optional HTTPS endpoint receiving monitoring events |
| `DATABASE_URL` | tests only | Postgres URL for the RLS integration suite |

Validate a configuration without printing secrets: `npm run env:check -- --target production --file <env file>`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `npm run lint` | `tsc --noEmit` · ESLint |
| `npm test` | Unit tests (compatibility, analytics, maintenance, revisions, validation, uploads, 3D asset mapping, schema sync) |
| `npm run db:local` then `DATABASE_URL=… npm run test:db` | Throwaway Postgres 16 + Supabase shim → migrations + seed → RLS/ownership/integrity suite |
| `npm run test:e2e -- [baseUrl]` | Playwright end-to-end journey against a running app + local Supabase |
| `npm run test:e2e:security -- [baseUrl]` | Security E2E (CSP, uploads, storage cleanup, rate limits, monitoring, auth links); needs local stack env vars, see file header |
| `npm run env:check` | Validate deployment environment variables |
| `npm run db:push:dry` | Show which migrations `supabase db push` would apply to the linked project |
| `npm run check` | typecheck + lint + unit tests + production build |
| `npm run db:seed:build` | Regenerate `supabase/seed.sql` from `supabase/catalog/*.json` |
| `npm run catalog:import -- file.json` | Import a real, sourced catalogue (service role) |
| `npm run model:generate` | Regenerate the placeholder GLB |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local Supabase schema |

## Deployment (Vercel + Supabase)

Step-by-step staging guide, including the manual steps that need a project owner: **[`docs/deployment/staging.md`](docs/deployment/staging.md)**. It covers:
- hosted Supabase: migrations with a dry run first, auth URLs, email templates, SMTP
- Vercel environment variables and the cleanup cron
- a smoke-test checklist and monitoring

CI (`.github/workflows/ci.yml`) runs:
- typecheck, lint, unit and static security tests, and the production build
- the RLS suites on Postgres 16
- a full local Supabase stack, running the RLS suites, the E2E journey and the security E2E

## Data honesty

- The bundled catalogue is **demo data**: fictional parts under the brands “VELOX Demo Parts / Works”, `verification_status = 'demo'`, labelled “Demo data” everywhere. No manufacturer specifications are invented.
- Unknown values stay `null` and render as **Unavailable**. Analytics report partial coverage instead of extrapolating; currencies are never converted.
- The 3D model is a **procedurally generated placeholder** and is labelled as such. Replacements that the model cannot represent are shown as *data-only*; only tire width is a real parametric preview (from the component’s `tire_width_mm`).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — structure, data model, security model, decisions (ADRs), known gaps
- [`docs/3d-assets.md`](docs/3d-assets.md) — 3D asset requirements and how to add production models
- [`docs/deployment/staging.md`](docs/deployment/staging.md) — staging deployment, manual steps, smoke tests, operations
