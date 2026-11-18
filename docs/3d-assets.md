# 3D asset strategy

## What ships today

`public/models/velox-placeholder-road.glb` (~0.5 MB, 45 meshes) is **procedurally generated** by
`scripts/generate-placeholder-model.mts` (`npm run model:generate`). It is a generic road bicycle built from
primitives, with one named mesh (or mesh group) per component position. The GLB carries
`extras.velox.placeholder = true` and the UI shows a *Placeholder model* badge.

It exists so the complete pipeline is real and testable without external assets:
GLTF loading → explicit mesh→slot mapping → selection/hover/highlight → camera focus → parametric tire-width
preview → material disposal.

## Requirements for production models

| Requirement | Detail |
| --- | --- |
| Format | glTF 2.0 binary (`.glb`), Y-up, metres, bicycle centred on X (forward) with wheels touching y = 0 |
| Naming | Every selectable part is a separate mesh (or group of meshes) with a **stable, unique name** |
| Separation | At minimum: frame, fork, headset, stem, handlebar, shifters, brakes (F/R), rotors (F/R), wheelset (rims, hubs, spokes), tires (F/R), crankset, BB, chain, cassette, derailleurs (F/R), saddle, seatpost, pedals |
| Materials | PBR metal/rough; frame paint as its own material(s) so `color_hex` can be applied |
| Budget | ≤ 150k triangles, ≤ 3 MB after compression for mobile; textures ≤ 2K, KTX2 preferred |
| Optimisation | `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt` (or Draco). Enable the matching decoder in `useGLTF(url, draco, meshopt)` in `BikeModel.tsx` and host decoders locally |
| Licence | Commercial-use licence documented next to the asset |

## Adding a model

1. Put the file in `public/models/<key>.glb`.
2. Create `src/features/studio/models/<key>.ts` exporting a `BikeModelMeta`:
   - `slots`: for each slot, the exact mesh names, a camera `focus` point and a `visual` capability
     (`static` = data-only replacements; `tire-width` = parametric scale on Z).
   - `paintMeshes`, `cameraPresets`, `defaultPreset`, `center`, `placeholder: false`, `license`.
3. Register it in `MODELS` (`registry.ts`). Bicycles reference it through `bicycles.model_key`.
4. `npm test` — `tests/unit/model-assets.test.ts` verifies every mapped mesh exists in the GLB and that no
   mesh is mapped twice.

## Modular (visual) component replacement — future work

For true visual replacement, each component variant needs its own asset (e.g. `cassettes/<component-slug>.glb`)
with a shared attachment convention (origin at the mounting interface, named anchor nodes on the frame such as
`Anchor_RearAxle`, `Anchor_BB`, `Anchor_SteererTop`). The metadata type can then gain a
`{ kind: "swappable", anchor: "Anchor_RearAxle" }` visual capability, and components a `model_asset` reference.
Until then the studio states clearly when a replacement is **data-only**.

## Fallbacks

- No WebGL / context failure / asset load error → interactive **2D side profile** (`BikeProfile2D.tsx`), a real
  SVG slot selector — not an image pretending to be 3D.
- Low-power devices (coarse pointer + ≤ 4 cores, or ≤ 2 GB memory): capped device pixel ratio, no antialiasing,
  no contact shadows; `PerformanceMonitor` lowers DPR further when frame rate drops.
- The viewer is code-split (`next/dynamic`, `ssr: false`); only one scene is mounted per page; render loop is
  on-demand except for the landing auto-rotate.
