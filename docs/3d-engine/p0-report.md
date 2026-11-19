# VELOX modular 3D engine: P0 report

**Branch:** `claude/velox-3d-engine-p0` (based on the hardening branch head; PR #1 is untouched).
**Status:** P0 complete. P1 has **not** been started and needs approval.

## 1. Outcome

The assembly model works. Five independently authored demo parts — two frames (road diamond, 29" hardtail) and three forks — were combined with wheels and tires generated from recorded dimensions. They were assembled at their attachment points, replaced, rendered in the browser and checked in Node. Every replacement changes:
- the decoded geometry
- the rendered pixels
- the 2D projection
- the derived values (pitch, BB height, wheelbase)

Missing data or missing models show an explicit state, and old geometry is never left on screen.

## 2. P0 deliverables

| Requested | Where |
| --- | --- |
| Final architecture specification | `docs/3d-engine/specification.md` (`velox-assembly/1`) |
| Coordinate system | spec §2 |
| Attachment-point convention + tolerances | spec §3 (types, axis rules, naming, attachment formula, tolerance table) |
| Mounting interface for every component | spec §4 (table by kind) |
| Component metadata schema | spec §5, `src/lib/assembly/spec.ts`, `docs/3d-engine/asset-declaration.schema.json` |
| Assembly function design | spec §6, `src/lib/assembly/resolve.ts` |
| Asset pipeline specification | spec §8.1, `scripts/assets/pipeline.mts` (implemented, deterministic) |
| CSP and decoder feasibility spike | spec §8.3, §3 below |
| Performance budget | spec §9 (budgets + measurements) |
| Test strategy | spec §10 |
| Risk analysis | §6 below |
| Prototype | `/lab/assembly` (`VELOX_LABS=1` only), `src/features/lab/*` |

The architectural requirements map to the specification as follows:

| # | Requirement | Spec / code |
| --- | --- | --- |
| 1 | Different frame geometries | §2, §4 templates; frames authored from their own geometry charts; ground solve |
| 2 | Coordinate conventions + tolerances | §2, §3.4 |
| 3 | Mounting interfaces | §4 |
| 4–5 | Geometry updates, never stale | §1, §6.4; renderer removes before loading |
| 6 | Missing dimensions → explicit state | `missing_dimensions` / `no_visual` |
| 7 | Revisions reproduce geometry | §7, `RevisionVisualRef` |
| 8 | Same description for 2D and 3D | `projection2d.ts` |
| 9 | Existing rules intact | No changes to the compatibility engine, RLS, RPCs or revisions; all existing suites green |
| 10 | Road, gravel, hardtail, folding | §4 |

## 3. Spike findings

1. **meshopt and WebAssembly.**
   - The WASM decoder works under our CSP with `'wasm-unsafe-eval'`, which is now added to `script-src`.
   - General `'unsafe-eval'` and `'unsafe-inline'` remain forbidden. The unit test and security E2E now check exact tokens instead of substrings.
2. **No-WebAssembly fallback.** meshoptimizer's MIT JavaScript reference decoder, vendored and drift-tested, decodes to **identical** geometry fingerprints. It was proven under a CSP without `'wasm-unsafe-eval'`.
   - This covers older Safari, which needs full `'unsafe-eval'` to run WebAssembly ([WebKit bug 197759](https://bugs.webkit.org/show_bug.cgi?id=197759)).
   - It is about 2.1–2.4× slower in Node.
3. **KTX2 is not CSP-compatible today.** The Basis transcoder that ships with three r187 is an Emscripten/Embind build: `craftInvokerFunction` calls `new Function` in its worker, which needs `'unsafe-eval'`.
   - KTX2 is therefore **disabled by default**; textures use the pipeline's fallback image.
   - Opting in (`?ktx2=1`) fails safely within the 4-second timeout.
   - **Recommendation:** re-enable KTX2 only with a transcoder built without dynamic execution (`-sDYNAMIC_EXECUTION=0`), re-verified by the same test.
4. **Node names.** three.js `GLTFLoader` strips `.` `:` `/` `[` `]` from node names. The proposal's `ANC.bb` became `ANC__bb`, and the pipeline rejects reserved characters.
5. **`blob:` loading.** `KTX2Loader.loadAsync(blobUrl)` needs `connect-src blob:`. Verified bytes are now passed to `parse()` instead, and the CSP is unchanged.
6. **Prerendering vs nonces (affects the main app).** A build without Supabase variables prerenders `/`, `/dashboard` and most pages as static.
   - Static pages carry no per-request nonce, so the CSP would block their scripts.
   - Found because the macOS CI build has no backend. The lab now calls `connection()`.
   - **Recommendation for PR #1 / P1:** make request-time rendering explicit in the root layout. Production has the variables (`env:check` enforces them), but a misconfigured preview would ship a broken page.
7. **Fingerprint hash bug** (found and fixed in P0): one hash lane went negative and printed a `-`. All fingerprints were regenerated.
8. **Hosting.**
   - Local Supabase public bucket: anonymous listing returns `[]`; anonymous upload is denied by RLS.
   - Public objects are served with `cache-control: max-age=31536000` and `Access-Control-Allow-Origin: *`. Storage does not add `immutable`; content-hashed paths make that safe.
   - Re-publishing uploads only the manifest pointer.

## 4. Prototype results (resolver, demo assets)

| Configuration | Frame pitch | BB height | Wheelbase | Assembly fingerprint |
| --- | --- | --- | --- | --- |
| Road frame + road fork (370 mm), 28 mm tires | −0.441° | 264.2 mm | 988.3 mm | `a659e49c870c659e` |
| → fork replaced: gravel fork (395 mm, 50 mm offset) | +0.844° | 273.3 mm | 1000.7 mm | `6ade57f1161d493e` |
| → tires replaced: 45 mm | −0.441° | 280.2 mm (+16.0 = 17 × 0.94) | 988.3 mm | `350f68f4613251f9` |
| Hardtail frame + 29" rigid fork (470 mm), 60 mm tires | −2.723° | 287.0 mm | 1167.7 mm | `1041b460f4b0f0ff` |

The hardtail's −2.7° pitch is a genuine geometric effect, and the tests assert it. The demo rigid fork is shorter than the frame's geometry assumes, so the front drops and the steering steepens to about 68.2°.

**Assets:** 5 parts, 7.3–17.9 KB each after meshopt (2.3–2.7× smaller than the source GLB). All are demo, `representative`, `LicenseRef-VELOX-demo`. No open-licence downloads were used in P0; the pipeline is source-independent.

## 5. Test results

| Suite | Local (this container) | GitHub CI |
| --- | --- | --- |
| Typecheck, lint, production build | pass | pass |
| Unit (134 existing + 26 new: 20 assembly, 6 asset set) | **160 / 160** | pass |
| Asset pipeline determinism (re-author + re-run + diff) | identical | pass |
| Database, Postgres 16 / real Supabase (unchanged) | 48 / 48 each | pass |
| E2E journey (unchanged) | 16 / 16 | pass |
| Security E2E (CSP check made token-level) | 16 / 16 | pass |
| Lab E2E, Chromium, static + Supabase source | **11 / 11** | run in the Supabase job |
| Lab E2E, Chromium, no-backend build (macOS-equivalent) | 10 / 10 | — |
| Lab E2E, WebKit desktop / iPhone 15 / iPad Pro 11 emulation | not runnable here (no WebKit in this container) | macOS job: see the final summary for its result |

**Lab E2E coverage:**
- assembly of independently authored parts
- fork, tire and frame replacement changing decoded geometry, pixels, 2D view and derived values
- missing-dimension state with no stale geometry
- unbound part removing the fork and its dependants
- integrity rejection of a tampered GLB
- GPU memory back to baseline after 20 swaps (18 geometries / 2 textures)
- no-WASM CSP mode (JS decoder, identical geometry, PNG textures)
- KTX2 opt-in failing safely without `'unsafe-eval'`
- Supabase-hosted assets

**Not verified (needs hardware):** real Safari on macOS, iPhone and iPad. Playwright WebKit with device emulation is the WebKit engine with a mobile viewport and user agent, not iOS Safari or Apple GPUs.

**Manual checklist before P1 ships:**
1. Safari 17/18 macOS and iOS: lab renders; decoder = wasm; zero CSP violations.
2. An iOS version without `'wasm-unsafe-eval'` support, if any is still in scope: decoder = js-reference.
3. iPad: orbit and touch, frame rate ≥ 30 fps, memory stable after 20 swaps.
4. Low-power mode.

## 6. Risks

| Risk | Severity | Status / mitigation |
| --- | --- | --- |
| No CSP-safe KTX2 transcoder | medium | KTX2 off; fallback images (PNG now, WebP in P1). Rebuild the transcoder without dynamic execution before enabling. |
| Real iOS/Safari behaviour unverified | medium | Emulation in CI; manual device checklist above is required. |
| Dimensional data gaps in the catalog | high | Missing dimensions are never filled. P1 needs sourced tire, wheel and fork dimensions for real components; the demo catalog is fictional. |
| Generated or representative parts look generic | medium | Honest labels. Commission frames, forks and wheelsets after the prototype is validated (your decision 2). |
| JS fallback decoder speed on old phones | low–medium | 2.1–2.4× WASM in Node; measure on devices; budget ≤ 150 ms. |
| Static prerendering breaks nonce CSP when env is missing | medium | Found here. Explicit dynamic rendering at the root (PR #1 follow-up / P1). |
| `'wasm-unsafe-eval'` widens the CSP | low | Allows WebAssembly compilation only; token-level tests forbid `'unsafe-eval'`. |
| Asset licensing for open-licence sources | medium | Licence and attribution are mandatory in the declaration; the pipeline rejects missing licences; `exact` requires documented rights. |
| Folding category has no prototype asset | low | Template and anchor set specified and tested in the resolver; first folding asset in P1. |
| Full suspension | deferred | Bodies and joints reserved (spec §6.6); no rebuild needed later. |

## 7. Exact scope of P1 (proposal, not started)

**Goal:** replace the studio's monolithic placeholder with the assembly engine behind a feature flag, for **road and hardtail**, using authored demo frames and forks plus generators. No database migrations: those are P3.

**In scope:**
1. **Production renderer.** Move the loader and renderer from `src/features/lab` into `features/studio/three/`:
   - `AssemblyRenderer` replaces `BikeModel`
   - selection by node ownership (`userData.velox.slot`), hover, pending tint and ghosting
   - camera presets and slot focus computed from assembly bounds, replacing hand-placed coordinates
2. **Studio integration.** `studio-client` builds `AssemblyInput` from installed and pending parts. The pending preview swaps real geometry, with a before/after toggle. The part panel shows representation, data inputs and assumptions.
3. **Steering and seat chain.** Headset/spacer and stem generators, a handlebar family generator (drop and flat/riser), and seatpost generators (rigid, dropper). Saddle uses one representative authored asset (open-licence if available, else demo).
4. **Drivetrain and brakes (geometry from data).**
   - Generators: cassette (cog teeth), chainrings and crank arms (teeth, crank length), derived chain path, rotors (diameter).
   - Authored (demo or open-licence): one rear derailleur and one caliper family.
5. **Interim catalog bindings without migrations.** A static mapping from demo catalog components to bindings, plus the dimensions already present in demo specs. Real `component_visuals` tables come in P3.
6. **2D fallback.** `BikeProfile2D` is replaced by the `AssemblySpec` projection.
7. **Hardening follow-ups.**
   - Request-time rendering at the root layout (nonce CSP).
   - WebP fallback textures in the pipeline.
   - Model assets served from the Supabase public bucket in deployed environments.
8. **Feature flag.** `NEXT_PUBLIC_ASSEMBLY_ENGINE` (or a server flag). The old placeholder remains the default until P1 exit.
9. **Tests.**
   - Fingerprint and pixel-diff acceptance for every slot with geometry.
   - Studio E2E with the new renderer.
   - Memory test across 50 swaps.
   - Triangle and draw-call budget assertions.
   - WebKit device jobs.

**Out of scope for P1:**
- database migrations (P3)
- folding and gravel assets (P4)
- full suspension
- commissioned assets
- KTX2
- fit data UI (P3/P4)

**Exit criteria:**
- Every slot that shows geometry passes the A→B fingerprint and pixel-diff tests.
- Existing journey, security and lab suites are green.
- Budgets hold.
- The manual Safari/iOS checklist is passed on hardware.

## 8. Decisions requested before P1
1. Approve the P1 scope above, including the interim static catalog bindings (no migrations in P1).
2. Approve request-time rendering at the root layout as a PR #1 follow-up (or inside P1).
3. Confirm KTX2 stays off until a CSP-safe transcoder is built and verified.
4. Arrange real-device access (or a device cloud) for the Safari/iPhone/iPad checklist.
