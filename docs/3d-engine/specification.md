# VELOX modular 3D engine — specification `velox-assembly/1`

Status: **P0, approved for review**. Normative for P1+. Supersedes the November 2026 proposal where the two differ:
- Node naming uses `ANC__`, not `ANC.`.
- KTX2 is disabled by default.

Reference implementation: `src/lib/assembly/*` (pure TypeScript), `scripts/assets/*` (pipeline), `src/features/lab/*` (prototype renderer).

---

## 1. Principles

1. **A replacement changes geometry.** When component A is replaced by B, the geometry shown for the slot is derived from B: either B's authored asset, or a generator fed with B's recorded dimensions.
2. **No stale geometry.** A's geometry is removed before B's loads. If B has no geometry, the slot shows an explicit state (§6.4); it never shows A's geometry under B's name.
3. **Representation is separate from data accuracy.** Every node has one representation:

   | Representation | Meaning | Allowed source |
   | --- | --- | --- |
   | `exact` | Authored model of this exact product | Licensed manufacturer model or manufacturer CAD with documented rights. Never demo or generated. |
   | `representative` | Authored model of the product family / shape class | Any approved authored asset |
   | `generated` | Built by a VELOX generator from this product's recorded dimensions | Generators only |
   | `none` | No geometry | — |

   Data accuracy (`verification_status` of the catalog record) is shown independently. Generated geometry is never labelled or described as a manufacturer model.
4. **No invented dimensions.** Generators require their dimensional inputs. A missing input gives `missing_dimensions` (§6.4). Representation choices that are not data (rim depth for display, tread, casing height model) are listed per node as `assumptions` and shown in the UI.
5. **One description.** The 3D renderer, the 2D fallback, tests and build revisions all consume the same `AssemblySpec` (§6).
6. **The compatibility engine stays the authority.** The resolver reports interface mismatches as warnings and still renders exactly what is configured. It never "fixes" a configuration.

## 2. Coordinate system and units

| Item | Convention |
| --- | --- |
| Units | Metres (glTF), millimetres and degrees in catalog dimensions and `measured` declarations |
| Axes | Right-handed. **+X forward, +Y up, +Z drive side** (rider's right). Same as the existing placeholder model. |
| Frame origin | Centre of the BB shell. Frames are authored in their **geometry-chart pose**: BB at the origin, head tube top at (reach, stack). |
| World | The resolver rotates the frame about +Z (pitch) and lifts it so both tires touch y = 0 (§6.3). BB height and pitch are therefore *derived*, not authored. |
| Fork authoring pose | Crown-race seat at the origin, steering axis along +Y, offset toward +X, axle at (offset, −axle-to-crown). |
| Wheel / tire | Hub centre at the origin, wheel plane = XY, axle = Z. |
| Asset root | Exactly one root node with an identity transform; the declaration lives in its `extras.velox`. |

## 3. Interfaces (attachment points)

### 3.1 Anchors, mounts and joints

- **Anchor**: where a part can be attached on a host. glTF empty node `ANC__<id>`.
- **Mount**: how a part attaches. Empty node `MNT__<id>` in the part.
- **Joint** (reserved, §6.6): `JNT__<id>`, connecting two rigid bodies of the same asset.
- **Material role**: `MAT__<role>` material names (`paint_primary`, `paint_secondary`, `metal`, `rubber`, `carbon`, `decal`, `plastic`).

Ids are lowercase `snake_case` without double underscores. **Node, mesh and material names must not contain `.` `:` `/` `[` `]` or whitespace.**
- three.js `GLTFLoader` strips these characters. This was a P0 finding: `ANC.bb` loads as `ANCbb`.
- DCC tools append `.001` to duplicate names.

Interface nodes must be empty: no mesh.

### 3.2 Interface types and axis rules

Every interface is a full frame. Local **+Z is the interface axis**, and +X completes a right-handed frame. Local +Y is set by type:
- `tube`: world-forward made orthogonal to +Z. Tube axes are near vertical, so "up" would be unstable.
- All other types: world-up made orthogonal to +Z.

`math.interfaceFrame()` implements this rule.

| Type | +Z | Origin | Used by |
| --- | --- | --- | --- |
| `axle` | Along the axle, toward the drive side | Midway between dropout / locknut faces | rear_axle, front_axle, hub_axle |
| `spindle` | Along the BB spindle, drive side | BB shell centre | bb |
| `bead` | Along the axle, drive side | Hub centre; bead seat diameter is a parameter | wheel bead → tire |
| `spline` | Drive side | Locating shoulder | freehub, rotor interface |
| `tube` | Direction the inserted part is **withdrawn**: up for seatpost and stem, down for the fork at the lower head-tube face | Reference face centre | seat_tube, head_upper, head_lower, steerer, handlepost |
| `clamp` | Clamped member: lateral (drive side) for bars, forward along the rails for saddles | Clamp centre | bar_clamp, saddle_clamp |
| `face` | Mounting-face normal, out of the host toward the part | Face reference point (first bolt / hanger bolt) | brake mounts, rd_hanger, fd_mount, cages |
| `thread` | Outward from the centre plane: +world Z on the drive side, −world Z on the non-drive side | Thread face centre | pedal_l / pedal_r |

Left and right parts use explicit `_l` / `_r` interfaces and assets. **Runtime mirroring (negative scale) is not allowed**: it flips triangle winding.

### 3.3 Attachment

```
part.local = anchor.pose · T(0, 0, slide) · Rz(angle) · mount.pose⁻¹
```

- `slide` moves along the anchor's +Z within the anchor's declared `slide.min…max`, for seatpost insertion and spacer stack.
- `angle` rotates about +Z: stem flip, bar roll, saddle tilt, crank display angle.
- A slide outside the declared range is a warning.
- Mount and anchor types must match.
- `standard` strings (axle, steerer, clamp, BB, brake mount) are compared. A mismatch is warning `interface_mismatch:<anchor>`, and the compatibility engine decides.

### 3.4 Tolerances (`conventions.TOLERANCE`)

| Check | Tolerance |
| --- | --- |
| Unit quaternion | `abs(abs(q) − 1)` ≤ 1e-4 |
| Declared interface pose vs glTF node | ≤ 0.1 mm, ≤ 0.05° |
| Mount/anchor coincidence after assembly | ≤ 0.1 mm, ≤ 0.05° |
| Interface axis rule | ≤ 0.5° |
| Declared `measured` vs geometry, authored | ± 2 mm, ± 0.1° |
| Declared `measured` vs geometry, generated | ± 0.5 mm |
| Tire contact after ground solve | ≤ 0.5 mm from y = 0 |

## 4. Frame templates, categories and mounting interfaces

Categories do **not** share one universal bicycle. Each target has its own template, anchor set and wheel sizes.

| Target | `bicycles.category` | Template | Required frame anchors | Optional | BSD (ISO 5775) | Steering |
| --- | --- | --- | --- | --- | --- | --- |
| Road | road, cyclocross, time_trial, touring | `diamond` | bb, rear_axle, head_lower, head_upper, seat_tube, rd_hanger, rear_brake | fd_mount, cage_1, cage_2 | 622 | fork + stem + bar |
| Gravel | gravel | `diamond` | as road | as road | 622, 584 | fork + stem + bar |
| Hardtail MTB | mountain | `hardtail` | as road | fd_mount, cage_1, dropper_port | 622, 584 | fork + stem + bar |
| Folding | folding *(new enum value, P3)* | `folding` | bb, rear_axle, head_lower, **handlepost**, seat_tube, rear_brake | rd_hanger, fold_hinge | 349, 406, 451 | fork + handlepost |

A frame is accepted only for the categories and the template it declares; anything else is `invalid_binding`. Full-suspension is deferred; it becomes a fourth template using bodies and joints (§6.6).

**Mounting interface per component kind** (P0 implements frame, fork, wheel and tire; the rest are normative for P1+):

| Kind | Mount (part) | Attaches to (anchor) | Anchors it provides | Key `measured` |
| --- | --- | --- | --- | --- |
| frame | — (root) | — | template set above | stack, reach, head/seat angle, chainstay, BB drop, wheel BSD |
| fork | `crown_race` (tube) | frame `head_lower` | steerer, front_axle, front_brake | axle_to_crown, offset |
| wheel (generated) | `hub_axle` (axle) | frame `rear_axle` / fork `front_axle` | bead, freehub (rear), rotor | bsd |
| tire (generated) | `bead` | wheel `bead` | — | width, bsd |
| headset / spacers (generated) | `bearing` (tube) | frame `head_upper` | stack_top | stack height |
| stem (generated) | `steerer_clamp` (tube) | frame `head_upper`, slide = headset + spacers | bar_clamp | length, angle, clamp Ø |
| handlebar (family generator) | `clamp` (clamp) | stem `bar_clamp` | lever_l, lever_r, grip_l/r | width, drop, reach, flare, rise, sweep |
| handlepost (folding) | `post` (tube) | frame `handlepost` | bar_clamp | height, fold state |
| seatpost (generated) | `insertion` (tube) | frame `seat_tube`, slide = insertion | saddle_clamp | Ø, length, setback |
| saddle | `rails` (clamp) | seatpost `saddle_clamp` | — | rail height, length, width |
| crankset | `spindle` (spindle) | frame `bb` | pedal_l, pedal_r, ring | crank length, teeth |
| cassette (generated) | `spline` | rear wheel `freehub` | — | cog teeth |
| rear derailleur | `hanger` (face) | frame `rd_hanger` | — | — |
| front derailleur | `mount` (face) | frame `fd_mount` | — | — |
| brake caliper | `mount` (face) | frame `rear_brake` / fork `front_brake` | — | rotor size |
| shifter / lever | `clamp` (clamp) | handlebar `lever_l/r` | — | — |
| pedal | `thread` (thread) | crankset `pedal_l/r` | — | — |
| chain (derived) | — | path from ring, cog, pulleys, chainstay | — | pitch 12.7 mm |

## 5. Metadata schema

**Asset declaration.** Authored in the asset as `extras.velox` and copied into the manifest. TypeScript: `AssetDeclaration` in `src/lib/assembly/spec.ts`. JSON Schema for external authors: `docs/3d-engine/asset-declaration.schema.json`. The pipeline's `validateAsset()` is authoritative.
- Required fields: `spec`, `key` (slug), `version` (integer, immutable), `kind`, `label`, `representation` (exact | representative), `categories`, `template` (frames), `units`, `anchors`, `mounts`, `measured`, `materials`, `license` (`id`, `attribution`, `url`), `author`, `source`, `demo`.
- Optional fields: `joints`, `textures`.

**Manifest entry** (`ManifestEntry`): the declaration plus:
- `file`: content-hashed path
- `sha256`, `bytes`, `triangles`
- `geometryFingerprint`: decoded positions quantised to 0.1 mm
- `compression`
- `textures`: KTX2 plus a fallback, each with its own SHA-256
- `pipeline` version

The manifest is published as an immutable `manifest-<sha12>.json`. A mutable pointer `manifest.json` is cached for 60 s. The server holds the expected manifest SHA-256 and the client verifies it.

**Component binding** (`VisualBinding`, stored in `component_visuals` from P3):
- `{kind: "asset", key, version}`
- `{kind: "generator", generator, version}`

Dimensions come from the catalog (`component_specifications` / attributes) and are never stored in the binding.

**Privacy.** Assets are public. The pipeline rejects:
- email addresses
- UUIDs
- JWTs or keys
- local file paths

These are rejected anywhere in names or extras. `key@version` asset references are exempt. Assets are catalog-level and never derived from user data.

## 6. Assembly function

`resolveAssembly(input: AssemblyInput, manifest: AssetManifest): AssemblySpec`. The function is pure, deterministic and framework-free; three.js is used for maths only.

### 6.1 Steps
1. Category → template (§4).
2. Frame: must be an approved `frame` asset of that template and category. Its required anchors must be present.
3. Fork: `crown_race` → frame `head_lower`. Standards are compared.
4. Wheels (generator): front `hub_axle` → fork `front_axle`; rear → frame `rear_axle`. BSD comes from `bsd_mm` or the catalog `wheel_size`, mapped through the ISO table.
5. Tires (generator): `bead` → wheel `bead`. The tire's own size and width must be recorded.
6. Ground solve (§6.3), then world poses parent-first, then world anchor positions.
7. Output: nodes, derived values (pitch, BB height, wheelbase), warnings, revision refs (§7), fingerprint.

P1 (implemented) continues in this order:

8. **Stem** (generator). `steerer_clamp` → frame `head_upper`, slid 10 mm up the steerer.
   - The headset cover and spacer stack are not recorded, so this is a display value (`DISPLAY_FIT`) and is listed as an assumption.
   - The stem's steerer diameter is compared with the steerer diameter that the frame's headset standard takes (`tapered_1.125_1.5` and `zs44_ec49` both take 28.6). It is not compared with the headset string itself.
9. **Handlebar** (generator, `drop` or `flat` variant). `clamp` → stem `bar_clamp`.
   - The roll about the clamp axis is solved so the bar's +Y is world-vertical ("Bar roll not recorded — shown level").
   - Clamp diameters are compared only when both sides are **recorded**; display defaults are never compared.
10. **Seatpost** (generator). `insertion` → frame `seat_tube`, inserted min(120 mm, length − 50 mm) and clamped to the anchor's slide range.
    - Saddle height is fit data and is not recorded, so this is listed.
11. **Crankset** → frame `bb`. **Cassette** → rear wheel `freehub`.
12. **Rotors** → the wheel's `rotor` anchor. Only disc-brake wheels declare one; on a rim-brake wheelset the rotors are `host_unavailable` and are never left floating.
13. **Chain** (derived). It is laid in world space from the largest chainring and the smallest cog actually in the assembly.
    - Without both of these it is `host_unavailable`.
14. **Not modelled.** Slots that are not modelled (`notModelled`: saddle, pedals, derailleurs, brakes, …) get no node and are listed explicitly; they never borrow geometry.
    - Absent slots produce no node.

### 6.2 Output

`AssemblySpec { spec, category, template, nodes[], derived, derivedQuality, notModelled[], warnings[], revision, fingerprint }`.

**`derived`** holds these values, all relative to the BB in mm:
- `pitchDeg`, `bbHeightMm`, `wheelbaseMm`
- `barClampMm {x, y}`, `saddleClampMm {x, y}`, `lowestPedalMm`

**`derivedQuality[key]`** gives `{quality: recorded | estimate | unavailable, notes[]}`:
- A value is **recorded** only when every input is recorded data.
- Any representative frame or fork, modelled tire height, display stack or display saddle height makes it an **estimate**, and the note says why.
- A value that cannot be computed is **unavailable**. It is never filled in.

Each `AssemblyNode` has:
- `id`, `slot`, `label`
- `representation`, `status`
- `source`: asset key, version and SHA-256; or generator id, version, params and assumptions
- `attach`, `local`, `world`
- `anchorsWorld`
- `missing[]`, `warnings[]`

### 6.3 Ground solve

Let `Pr` and `Pf` be the rear and front axles in frame space, and `Rr` and `Rf` the contact radii. The contact radius is the tire's outer radius, or the rim's bead radius when the tire has no geometry. Then:

```
d = Pf − Pr,  L = |d.xy|,  φ = atan2(d.y, d.x)
pitch θ = asin((Rf − Rr) / L) − φ
frame.world = { t: (0, Rr − (Rz(θ)·Pr).y, 0), r: Rz(θ) }
```

Contact is verified to within 0.5 mm. A longer fork therefore pitches the frame nose-up and slackens the head angle. A wider tire raises the BB by the change in radius. Both are tested.

### 6.4 States (`NodeStatus`)

| Status | Meaning | UI |
| --- | --- | --- |
| `ok` | Resolved and attached | Rendered |
| `no_visual` | Component has no 3D binding | "No 3D model for this part" |
| `missing_dimensions` | A required dimension is missing | "Unavailable: needs verification: …" (lists the dimensions) |
| `host_unavailable` | The part it mounts on is unavailable | "Mount point unavailable" |
| `invalid_binding` | Asset unknown, or wrong kind, template or category | "3D model does not fit this bike" |
| `not_in_prototype` | Slot not implemented yet | data-only (existing notice) |

### 6.4.1 Generators (P1)

Each generator is a `GeneratorDef { id, version, required[], resolve(dims, {position, variant}), build(params), profile2d(params) }` (`src/lib/assembly/generators/`).
- `resolve` reads **only recorded dimensions**. It returns `missing[]`: if anything required is missing, the node is `missing_dimensions` and no geometry is built.
- Every display choice that is not data is listed in `assumptions[]` and shown in the UI.
- `build` and `profile2d` take the **same params**, so the 2D side view (`projection2d.ts`) is the generator's own profile transformed by the node's world pose. There is no second 2D geometry calculation.

| Generator | Required (recorded) | Optional / assumed (listed) |
|---|---|---|
| wheel v2 | BSD (`wheel_size` / `bsd_mm`) | rim depth/width; hub spacing from axle standard (OLD); `rotor` anchor only for `brake_type: disc` |
| tire | width + BSD | outer height = 0.94 × width |
| stem | length, angle | steerer/bar clamp Ø (28.6/31.8 shown), clamp stack 40 mm |
| handlebar `drop` | width, reach, drop | flare (0°), clamp Ø |
| handlebar `flat` | width | rise, backsweep (0), clamp Ø |
| seatpost | length, diameter | setback (0) |
| crankset | crank length, chainring teeth | chainline 43.5 mm, ring spacing 5.5 mm, arms horizontal |
| cassette | cog teeth | cog pitch from speed count (12 s = 3.5 mm …) |
| chain | speed count | on big ring / smallest cog; lower run straight (derailleur not modelled) |
| rotor | diameter | spider/vents cosmetic |

Sprocket pitch radius = 12.7 mm / (2 sin(π / teeth)).

**Temporary demo links (P1).** `src/features/studio/assembly/demo-bindings.ts` maps demo catalogue slugs to an asset or a generator. P3 replaces this with the `component_visuals` table, so there are no database changes in P1.
- A component without a link has no 3D representation.
- Custom parts never have one.
- Authored assets declare `matchesRecordedGeometry` only when they were built to the component's recorded dimensions. The demo carbon fork is built to its recorded 370 mm axle-to-crown and 47 mm offset. The demo frame is not built to recorded geometry.

### 6.5 Fingerprints
- `geometryFingerprint`: positions in asset-root space quantised to 0.1 mm, plus indices, ordered by node name. The pipeline computes it; the browser recomputes it after decoding (wasm or JavaScript) and compares.
- `AssemblySpec.fingerprint`: each node's source plus its world pose, at 0.1 mm / 1e-4 resolution.

The CI acceptance rule: replacing A with B must change both fingerprints, and the rendered pixels.

### 6.6 Extensibility: suspension and folding
Assets may contain several rigid **bodies** (`AnchorDecl.body`) linked by **joints** (`JointDecl`: revolute or prismatic, axis = local +Z, range, and a `state` input such as `sag_mm` or `fold_deg`).
- **Order of solving:** the resolver will solve an asset's joints from state inputs *before* attaching children to that asset's anchors.
- **What stays unchanged:** suspension forks, full-suspension rear triangles and folding hinges are added without changing the attachment model, the revision format or the renderer. A full-suspension frame is a new template whose `rear_axle` and `rear_brake` anchors sit on body `rear_triangle`.
- **Status:** not implemented in P0 or P1; the schema reserves it.

## 7. Build revisions

`AssemblySpec.revision` gives, per slot, a `RevisionVisualRef`:
- `{representation: exact|representative, asset: {key, version, sha256}}`
- `{representation: "generated", generator: {id, version, params, paramsHash}}`
- `{representation: "none", reason}`

**P3** stores this as `visual` in `bicycle_configuration_snapshot()`, inside the existing SECURITY DEFINER RPC, with no new client write path.

**Reproduction:**
- Asset versions are immutable, and old versions are never deleted while a revision references them.
- Generator versions are immutable; a new behaviour is a new version.
- So a historical revision re-renders byte-identically. A test asserts identical fingerprints.

**Fit data stays out of these refs.** It is private and lives in owner-only storage (§11).

## 8. Delivery: pipeline, hosting, decoders, CSP

### 8.1 Pipeline (`scripts/assets/pipeline.mts`)
The pipeline works the same whatever the asset's source: procedural, open-licence or commissioned. For each asset:
1. Khronos glTF-Validator: errors fail the run.
2. Contract check (`validateAsset`): names, interfaces, axis rules, declared vs measured, budgets, licence, representation honesty, privacy.
3. `dedup → prune(keepLeaves) → weld → quantize → EXT_meshopt_compression`.
4. Re-read the output with the decoder and re-run the contract.
5. Geometry fingerprint.
6. Textures: KTX2 (ETC1S) plus a fallback image.
7. Content-hashed names and a versioned manifest.

The output is **deterministic**: CI re-authors and re-runs it and requires a byte-identical result.

### 8.2 Hosting
- **Bucket:** public Supabase Storage bucket `model-assets`.
- **Paths:** `models/<kind>/<key>/<version>-<sha12>.glb` and `textures/<key>/<version>-<role>-<sha12>.ktx2|png`.
- **Caching:** `Cache-Control: max-age=31536000` on content-hashed files and 60 s on the pointer.
- **Writes:** only the service-role pipeline, never users. Anonymous upload and listing are denied, which P0 verified.
- **Client:** fetches with `credentials: omit` and verifies SHA-256 *before* parsing. A mismatch means not rendered and reported.
- **Cache:** reference-counted per `key@version`; GPU resources are disposed at zero references.

### 8.3 Decoders and CSP: P0 results

| Path | Needs | Result |
| --- | --- | --- |
| meshopt WASM decoder (three) | `'wasm-unsafe-eval'` | ✅ Works in Chromium under the CSP. Fingerprints match the pipeline. |
| meshopt JS reference decoder (vendored, MIT) | nothing | ✅ Automatic fallback when WebAssembly is blocked or missing. Identical fingerprints. 2.1–2.4× slower in Node (§9). |
| KTX2 / Basis transcoder (three r187 build) | **`'unsafe-eval'`** (Emscripten `new Function` in its worker) | ❌ Blocked by our CSP. KTX2 is **disabled by default**; textures use the fallback image. Re-enable only with a transcoder built without dynamic execution, re-verified. |
| `blob:` URL loading in `KTX2Loader.loadAsync` | `connect-src blob:` | Avoided: verified bytes are passed to `parse()`. |

The CSP adds only `'wasm-unsafe-eval'` to `script-src`. A unit test and the security E2E check this at the token level: `'unsafe-eval'` and `'unsafe-inline'` remain absent.

## 9. Performance budget

| Item | Budget (desktop / mobile LOD1) | P0 measurement |
| --- | --- | --- |
| Frame | ≤ 40k / 15k tris | demo frames: 592 tris |
| Fork | ≤ 10k / 4k | demo forks: 204 tris |
| Wheel + spokes + tire (generated) | ≤ 18k / 7k | 5,376 tris per wheel + tire (1,920 + 3,456) |
| Whole bike | ≤ 150k / 60k tris; ≤ 120 draw calls | P1 full road build: 22,792 tris, 18 meshes (hardtail 22,520 / 18); unit-tested |
| Transfer (compressed) | ≤ 3 MB per bike | meshopt: 40k tris 968 KB → 250 KB; 150k tris 3.6 MB → 933 KB |
| Decode, WASM (Node, this CI class) | ≤ 20 ms per bike | 2.1 ms (40k) / 7.2 ms (150k) |
| Decode, JS fallback | ≤ 150 ms per bike on mobile *(to measure on device)* | 5.1 ms / 15.3 ms (Node) |
| Memory | returns to baseline after swaps | 18 geometries / 2 textures before and after 20 swaps |

## 10. Test strategy

| Layer | What | Where |
| --- | --- | --- |
| Unit, P1 | Full road and hardtail builds from the demo links. Replacements change exactly the right measurements: crank +5 mm → pedal −5 mm; stem length/angle → bar clamp at the exact length; cassette and chain radii; rotor radius; tire → ride height. Also covered: clamp-mismatch reporting, missing dimensions, unlinked parts, rim-brake rotors, chain without hosts, measurement quality, level bar, 2D parity, budgets, adapters, revision refs | `tests/unit/assembly-p1.test.ts` |
| Browser, studio (P1) | The real studio with the engine on: modular render, UI replacement (pixels, geometry, measurements), before/after, missing dimensions, 2D, save revision and reload, classic fallback (remembered), unsupported category, empty build, tampered manifest, overflow | `tests/e2e/studio-assembly.e2e.mjs`: Chromium plus Linux WebKit desktop, iPhone 15 and iPad Pro 11 emulation, in the Supabase job |
| Unit, pure | Attachment maths and tolerances, axis rules, resolver (assembly, replacements, derived values, missing data, no stale geometry, templates and categories, interface warnings), generators (bounds, assumptions, determinism), 2D projection, revision refs and reproduction, contract validation | `tests/unit/assembly.test.ts` |
| Unit, assets | Manifest integrity, content addressing, decoded fingerprint with WASM **and** JS decoders, contract after decoding, representation honesty, vendored decoder drift | `tests/unit/assembly-assets.test.ts` |
| Pipeline | Determinism (CI re-author + re-run + diff) | CI `quality` |
| Browser | Real rendering: pixels change on replacement, decoded geometry changes, 2D changes, missing-dimension state, no stale geometry, integrity rejection, memory baseline, CSP matrix (default / no-wasm / KTX2 opt-in), Supabase-hosted source | `tests/e2e/assembly-lab.e2e.mjs` (Chromium in the Supabase job; WebKit desktop, iPhone 15 and iPad Pro 11 emulation on macOS) |
| Regression | Existing journey, security E2E, unit and database suites | unchanged |
| Manual (required before P1 ships) | Real Safari (macOS 15/16+), iPhone and iPad hardware: rendering, WASM decoder, fallbacks, frame rate, memory | checklist in the P0 report |

## 11. Bicycle fit data (design; implemented in P3)

`bicycle_fit` is a new table: one row per bike, **owner-only RLS**, private by default. Optional fields, in mm or degrees, with check-constrained ranges:
- saddle_height
- saddle_setback
- saddle_tilt
- stem_length
- stem_angle
- spacer_stack
- handlebar_height
- handlebar_reach
- crank_length
- frame_size_label

Fit values drive slides and angles (§3.3); they never change catalog data.
- **Public passport:** shows none of it unless the owner enables `passport_show_fit_<group>` toggles, which default to false. Public views select only the enabled groups, following the existing masking pattern.
- **Revisions:** do not store fit in the public snapshot. Fit history, if any, is owner-only.
- **UI copy:** "Your recorded setup", not advice. No medical or professional fitting recommendations are made.

## 12. Risks

See `docs/3d-engine/p0-report.md` §6.
