# P1 report: modular assembly in the studio

Branch `claude/velox-3d-engine-p1`, based on P0 (`f169433`), which sits on PR #1's head.

- PR #1 and its branch are untouched.
- No pull request was created.
- No database migrations.
- No deployment.
- P2 has not started.

## What was built

| Area | Status |
|---|---|
| Feature switch `NEXT_PUBLIC_ASSEMBLY_ENGINE=1` | Done. Off by default: the studio is the pre-P1 experience. On: the modular viewer is the default, with a **Classic** toggle (remembered per browser). The classic viewer is also the automatic fallback for unsupported categories, an unverifiable manifest, and renderer errors (error boundary) |
| Categories | Road (`road`) and hardtail (`mountain`) templates. Other categories show an explicit notice and the classic viewer |
| Generators | stem, handlebar (drop/flat), seatpost, crankset, cassette, chain, rotor; wheel v2 (rotor anchor for disc hubs). All are deterministic, need recorded dimensions, and list their assumptions |
| Authored assets | New `fork-demo-carbon-disc`, built to the demo fork's recorded 370 mm axle-to-crown and 47 mm offset. The library moved to `public/model-assets`; new immutable manifest `b13e8c2cef47`; old manifests kept |
| One description for 2D and 3D | `projectSide(spec)` uses each generator's `profile2d(params)` with the node's world pose: the same params as the 3D build |
| Demo catalogue → 3D | `demo-bindings.ts` explicitly maps slugs to an asset or a generator. There are no DB changes; P3 replaces it with `component_visuals`. Unlinked and custom parts get "No 3D model", never borrowed geometry |
| Truthful status | Exact / Representative / Generated / None per slot in the part panel (saved and preview), with params, assumptions and gaps. Representative models say "Not a model of this exact product." No current asset is labelled Exact |
| Measurements | BB height, wheelbase, bar clamp, saddle clamp and lowest pedal, each labelled recorded / estimate / unavailable with reasons. Every frame-derived value is an **estimate**, because no demo frame has a recorded geometry chart |
| Real replacement | Picker previews regenerate or reload the part, move dependants (bar on stem, chain on rings and cogs, rotors on hubs), re-solve ground contact and update the measurements. "Show saved" gives before/after. Saving creates a normal revision |
| Studio UI | Camera presets computed from the assembly, 2D toggle, fullscreen, hover and selection highlighting, pending-part highlighting, paint colour on frame and fork |

### Bug found and fixed while testing

The resolver compared the stem's steerer clamp (28.6) with the frame's **headset standard string**, so every build had a false "interface mismatch".

- **Fix:** the headset standard is now converted to the steerer diameter it takes.
- **Recorded data only:** clamp standards are compared only when both sides are recorded data.
- **Result:** the real mismatch (35 mm stem with a 31.8 mm bar) is still reported, and a test covers it.

## Tests

### Local results (this container, Linux)

| Suite | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | pass |
| Lint (`eslint`) | pass, 0 warnings |
| Unit (`vitest tests/unit`) | **190 / 190** (P1 adds 30 in `assembly-p1.test.ts`) |
| Database (shim + all migrations + seed, Postgres 16) | **48 / 48**; seed unchanged |
| Asset pipeline reproducibility (re-author + re-run + diff) | byte-identical |
| Production build (configured, with engine flag) | pass |
| Lab E2E, Chromium (production renderer) | **12 / 12** |

### Not runnable here

The studio E2E, the real-Supabase suites and WebKit could not run locally (no Docker, no WebKit). They ran in CI; results below.

### CI results: run 44527754752 on `845aef7` (all P1 code; later commits are documentation only)

| Job / step | Result |
|---|---|
| Typecheck, lint, unit tests, asset reproducibility, build (no Supabase env) | pass |
| Migrations + RLS + hardening (Postgres 16 shim) | pass |
| Real local Supabase: RLS and hardening suites | pass |
| Engine **off**: journey | pass (16/16 in every run of this job) |
| Engine **off**: security E2E | pass (16/16) |
| Engine **off**: assembly lab, Chromium, static and Supabase-hosted assets | pass |
| Engine **on**: journey | pass (16/16) |
| Engine **on**: security E2E (includes CSP on the modular studio) | pass (16/16) |
| Studio E2E, Chromium desktop | **13/13** |
| Studio E2E, Linux WebKit 26.6, desktop | **13/13** |
| Studio E2E, Linux WebKit, iPhone 15 emulation | **13/13** |
| Studio E2E, Linux WebKit, iPad Pro 11 emulation | **13/13** |
| Assembly lab on macOS WebKit (desktop, iPhone 15, iPad Pro 11 emulation) | **not run in this run** (see below) |

**The macOS job.**
- In the last two runs it was cancelled after 15 minutes without being assigned a macOS runner. That is runner availability, not a test result.
- Its most recent real run (run 44513820095, commit `83ab281`) passed on WebKit desktop, iPhone 15 emulation and iPad Pro 11 emulation.
- Since `83ab281`, the only changes are E2E test files, CI configuration and documentation. No application or lab code changed.

**Failures found and fixed on the way to green:**
- **Engine-on security E2E:** it expected the classic viewer's canvas on the studio page. It now expects the modular canvas when the engine is on, and the CSP assertions are unchanged.
- **Studio E2E, empty mountain bike:** the test waited for the wrong text. The UI was correct, which I verified with a local harness that rendered the real studio component.
- **Studio E2E on phone/tablet layouts:** the part sheet covers the pending-changes bar, so the test now closes the panel first, as a rider would. This layout behaviour predates P1.
  - Follow-up worth considering: make "Save revision" reachable while the sheet is open.
- **WebKit page errors:** WebKit reports same-origin fetches cancelled by navigation (RSC prefetches, the classic GLB) as page errors "due to access control checks". Only that message, for same-origin addresses, is ignored.
- **CI infrastructure:** a stalled Playwright browser download is now retried (three bounded attempts). The engine-on steps run only when the engine server actually started.

### What "WebKit" means here

Playwright WebKit is the open-source engine, run on Linux and macOS with device emulation (viewport, DPR, touch, user agent).

**It is not Safari**, and emulation is not iPhone or iPad hardware. It does not show:
- real iOS GPU limits;
- memory pressure and tab eviction;
- Safari's WebGL quirks;
- thermal throttling;
- real touch gestures.

**No real iPhone, iPad or Safari hardware has been tested.**

## Security

- **CSP:** unchanged.
  - `'wasm-unsafe-eval'` only; there is no `'unsafe-eval'`, which a test asserts.
  - KTX2 stays disabled.
  - The security E2E rechecks CSP on the studio with the engine on, and the studio E2E counts violations from the first script.
- **Integrity:** the manifest is fetched against a SHA-256 pointer the server supplies.
  - A tampered manifest drops back to the classic viewer with a notice (E2E).
  - Tampered assets are rejected before parsing (lab E2E).
- **No new write paths:** saving still goes through `apply_bicycle_configuration` (SECURITY DEFINER, owner check). The studio E2E applies its setup build with the rider's own token, so RLS applies.
- **No new data exposure:** the test hooks (`window.__veloxStudio` / `__veloxLab`) contain geometry and status only, no personal data. Fit data is not involved.
- **Separate investigation:** see `docs/security/csp-static-rendering.md`. It found that builds **without** Supabase env serve ten static pages whose scripts are all blocked by the nonce CSP; configured production is unaffected.
  - The proposed fix is a two-line change in PR #1 code plus a CI guard.
  - **It has not been applied**; it is waiting for your approval.

## Performance

| | Road | Hardtail | Budget |
|---|---|---|---|
| Triangles | 22,792 | 22,520 | ≤ 150k desktop / 60k mobile |
| Meshes (≈ draw calls) | 18 | 18 | ≤ 120 |
| GPU memory after 24 swaps | 29 geometries / 7 textures, back to baseline (Chromium) | | baseline |

Other notes:
- **Loading:** generated parts are built on the client in milliseconds. Only the frame and fork assets are downloaded (about 23 KB).
- **No device measurements:** frame rate and memory on real phones are not measured. See the manual checklist.

## Limitations

- **Frame geometry:**
  - The road demo frame is a representative shape, not the endurance frame's real geometry, so wheelbase, reach and stack are estimates.
  - There are no frame geometry charts in the catalogue yet; that is P3 catalogue data.
- **Unlinked or incomplete demo parts:**
  - The gravel fork lacks axle-to-crown, and the steel rim-brake fork has no data, so both show "No 3D model". Gravel and steel frames are unlinked.
  - The carbon drop bar lacks drop, and the flared bar lacks reach and drop, so both show "needs verification".
  - The rim-brake wheelset has no rotor mount, so its rotors are unavailable.
- **No MTB parts in the demo catalogue:**
  - The hardtail path is covered by the lab (clearly labelled, lab-only parts) and by unit tests.
  - In the studio, a mountain bike shows the modular viewer with explicit empty and unavailable states.
  - Adding MTB demo parts to the seed is a question still open for you.
- **Not modelled in P1:** saddle, pedals, derailleurs, brakes/calipers, grips/tape, headset spacers.
  - These slots are listed as not modelled and are never drawn with borrowed geometry.
- **Display assumptions** (all labelled in the UI):
  - stem height on the steerer;
  - seatpost insertion;
  - chainline;
  - crank arm pose;
  - chain on big ring / smallest cog, with the lower run straight.
- **Revisions:** visual references are computed and tested but not stored with revisions. Storing them needs the P3 migration.

## Manual device checklist (still required)

Run on real hardware with the engine flag on: Safari macOS 15+, an iPhone (A15 or older if possible) and an iPad.

1. The studio loads a full road build. The decoder is reported as `wasm` (or the `js-reference` fallback), and the console shows no CSP violations.
2. Orbit, pinch-zoom and pan are smooth (target ≥ 30 fps on iPhone). The camera preset buttons work.
3. Replace stem, crank, cassette, rotor and tires. The part changes, measurements update, and "Show saved" toggles before/after.
4. Select the carbon bar: the "needs verification" state appears and no old bar stays visible.
5. Use the 2D toggle and the fullscreen button. Fullscreen is not available on iPhone Safari; check that the button fails silently.
6. Make 20+ swaps, then leave the tab in the background for 5 minutes and return. The scene is intact, with no reload loop or blank canvas.
7. Rotate between portrait and landscape: there is no horizontal overflow, and the bottom sheet is usable.
8. Use the Classic toggle, reload, and check the choice is remembered. Private browsing (no storage) must still work.
9. Use Low Power Mode and an older device: the scene stays usable, with no crash.

### Free options without buying devices

- Safari on any Mac you have access to. Safari's Develop → Responsive Design Mode is not hardware, but it is the real Safari engine.
- Xcode's iOS Simulator (free; uses the Mac's GPU, so not representative for performance).
- Testing a friend's or colleague's phone against a preview deployment.
- Browser-testing services: their free tiers exist but are limited. They have **not** been used, and paid tiers need your approval.

## Long-term direction (kept compatible, not implemented)

- **Catalogue and 3D are separate:** the 3D binding is keyed by catalogue component and resolved separately. A bike or component can exist with no 3D representation, and that is shown explicitly.
- **Representation flags:** the `matchesRecordedGeometry` and `representation` flags carry over to the provenance and verification fields of the future catalogue.
- **Measurements:** measurement quality comes from data provenance, so verified geometry charts upgrade estimates to "recorded" without changes to the engine.
- **No catalogue or P2/P3 work** was done.

## CI

See "CI results" above: run 44527754752 on `845aef7`. Every job passed except the macOS lab job, which was not run because no runner was assigned. Its last run, on `83ab281`, passed.
