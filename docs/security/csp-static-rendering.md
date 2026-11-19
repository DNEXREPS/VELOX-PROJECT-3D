# Nonce-based CSP and static rendering: investigation and proposed fix

Status: **proposal only.** Nothing in this document has been applied to PR #1 or its branch.
The change below touches PR #1 code (`src/lib/supabase/server.ts`). It waits for explicit approval.

## Summary

- PR #1 serves every page a CSP containing `script-src 'self' 'nonce-…' 'strict-dynamic'`.
  - With `'strict-dynamic'`, browsers ignore `'self'`: a script runs only if it carries the per-request nonce.
  - Next.js adds the nonce only while rendering a request. Prerendered (static) HTML has no nonces.
- **Production with Supabase configured is not affected today.**
  - Every page route renders dynamically, because the shared header reads the auth cookies through `createSupabaseServerClient()`.
- **Builds without Supabase variables are affected.** These are CI quality and macOS jobs, and local UI work.
  - `createSupabaseServerClient()` returns before reading cookies, so ten routes become static.
  - Their scripts are all blocked: the page loads but never hydrates.
- **The real risk is silent regression.** This works only because of an indirect dependency (the header reads cookies).
  - Any future page that stops reading request data becomes static and breaks the same way.
  - The SEO catalogue pages in the long-term plan are the obvious candidates.

## Evidence

All results are from local production builds (`next build && next start`, Next 16.4.6) in Chromium.

### Route render modes

| Build | Static (○) | Dynamic (ƒ) |
|---|---|---|
| Supabase configured | none | 31 |
| No Supabase env, current code | 10 | 21 |
| No Supabase env, with fix (a) below | none | 31 |

The ten static routes without env are:
- `/`, `/_not-found`, `/dashboard`, `/forgot-password`
- `/garage`, `/garage/new`, `/moderation`
- `/register`, `/reset-password`, `/settings`

### Delivered HTML (no Supabase env, current code)

| Path | CSP header | `<script>` tags | Tags with nonce | Cache |
|---|---|---|---|---|
| `/` | fresh nonce per request | 20 (17 external, 3 inline) | **0** | `x-nextjs-cache: HIT`, `s-maxage=31536000` |
| `/register` | fresh nonce per request | 21 | **0** | prerendered |
| `/login` (dynamic) | fresh nonce per request | 21 | 21 | `private, no-store` |

### Browser results

Measured with Chromium (Playwright): `securitypolicyviolation` events counted from the first script, plus a check for the React root.

| Build | `/` | `/register` | `/login` | `/dashboard`, `/garage`, `/settings` |
|---|---|---|---|---|
| No env, current | 20 violations, **not hydrated** | 21 violations, **not hydrated** | 0, hydrated | static (same failure) |
| No env, fix (a) | 0, hydrated | 0, hydrated | 0, hydrated | 0, hydrated |

### CI guard result

| Build | Guard result |
|---|---|
| No env, current | **fails**, listing the ten routes |
| No env, fix (a) | passes |
| Configured | passes |

## Which routes need per-request nonces, and which could be static

**Need dynamic rendering (per-request data):**
- Every authenticated page: `/dashboard`, `/garage/**`, `/settings`, `/moderation`.
- The auth pages, which redirect signed-in users and render auth messages.
- `/community/**`, `/explore`, `/components/**`, `/bike/**`, `/profile/**`: these read the session for the header, likes and ownership.
- They are already dynamic in production, so nonces cost them nothing extra.

**Could be static:**
- `/` (marketing).
- `/_not-found`.
- Future catalogue and brand pages: Workstream A, SEO.

Static rendering is only safe for these with a CSP that does not depend on a nonce; see option C below. Today the header shows session state on `/` too, so `/` is dynamic in production anyway.

## Options

| | Change | Effect | Verdict |
|---|---|---|---|
| A | `await connection()` in the root layout | Forces **every** route dynamic, including future static pages | Rejected: forces the whole app dynamic. You asked us not to |
| **(a)** | Read cookies **before** the env check in `createSupabaseServerClient()` (2 lines moved) | Render mode no longer depends on whether env is set. The set of dynamic routes is **identical** to configured production. Routes that never touch the session can still be static | **Recommended** (with the guard) |
| **Guard** | CI check after `next build`: fail if an HTML route is prerendered while it would receive a nonce CSP, unless allowlisted | Turns a silent runtime failure into a build failure | **Recommended** |
| C | Separate non-nonce CSP for an explicit allowlist of static routes, using hashes or SRI | Allows static, CDN-cached catalogue pages | Later (catalogue SEO work); needs a spike |
| D | Per-route `connection()` on the ten affected pages | Same result as (a), but ten edits that must be maintained | Inferior to (a) |

### Exact proposed change (a): PR #1 code, not applied

```diff
--- a/src/lib/supabase/server.ts
+++ b/src/lib/supabase/server.ts
@@ export async function createSupabaseServerClient() {
+  // Read request data first: the render mode (and therefore nonce support) must not
+  // depend on whether Supabase is configured.
+  const cookieStore = await cookies();
   const env = getSupabaseEnv();
   if (!env) return null;
-  const cookieStore = await cookies();
   return createServerClient<Database>(env.url, env.anonKey, {
```

**Reasoning:**
- In a configured deployment this changes nothing: the function already reads cookies on every call.
- In an unconfigured build, pages that consult the session render the same way they would in production, so the nonce CSP works.
- It does not weaken the CSP and adds no dynamic rendering beyond what production already does.

### Proposed guard

[`proposals/check-static-routes.mjs`](proposals/check-static-routes.mjs) would become `scripts/check-static-routes.mjs`. It runs after `npm run build` in the CI quality job, which builds without Supabase env.

- It reads `.next/prerender-manifest.json`.
- It ignores non-HTML entries (`/_global-error`, `/favicon.ico`, …).
- It fails on any other prerendered route that is not in `STATIC_CSP_ROUTES`.

Two orderings would work:
- Add the guard together with (a).
- Land (a) first, then the guard.

The guard alone would fail CI immediately, by design.

### Option C, for later (catalogue SEO)

**Constraints found:**
- Next's experimental SRI (`experimental.sri`) adds `integrity` to **external** scripts only.
- Static HTML also contains **3 inline scripts** (the RSC payload), which a strict policy without nonces blocks.
- A static-route policy therefore needs per-page SHA-256 hashes of those inline scripts, computed after the build. `'unsafe-inline'` is not acceptable.

**Proposed approach (spike first):**
- Hash the inline scripts after the build.
- Store the hashes per route.
- Have the proxy serve a hash-based policy (`'strict-dynamic'` plus `'sha256-…'`, with no nonce) only for allowlisted static routes.

**Open questions:**
- Whether hashes are stable across Next versions and deploys.
- Whether Safari's `'strict-dynamic'` behaviour with hashes matches Chromium's.
- ISR revalidation, which changes the inline payload.

## Implications

| Area | (a) + guard | Option A (rejected) | Option C (future) |
|---|---|---|---|
| **Performance** | No change in production. Unconfigured builds lose static HTML for ten pages; dev/CI only | All future static pages become per-request renders | Static and CDN-cacheable |
| **Caching** | Same as production (`private, no-store` on pages that read the session) | No CDN HTML caching anywhere | Full CDN caching for allowlisted routes |
| **SEO** | Neutral (pages are rendered server-side either way) | Catalogue pages slower (TTFB), crawl budget cost | Best |
| **Deployment** | No config change, no env change | None | Proxy needs a per-route policy table, generated at build time |
| **Security** | CSP unchanged; prevents silent breakage | CSP unchanged | Adds a second policy shape, which needs its own regression tests |

## Recommendation

1. Approve (a) plus the guard as a small follow-up commit on PR #1's branch, or a separate PR on top of it.
   - Tests: security E2E (CSP on public and private pages), the journey, and the no-env browser check above.
2. Keep option C for the catalogue SEO work. Spike it before any catalogue page is made static.
