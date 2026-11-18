import type { BikeSlot } from "@/lib/domain/slots";

export type Vec3 = [number, number, number];

export interface CameraPreset {
  id: string;
  label: string;
  position: Vec3;
  target: Vec3;
}

/** How a slot's meshes respond to a component change in the 3D preview. */
export type SlotVisual =
  /** Geometry for this slot is fixed — replacements are data-only (and labelled as such). */
  | { kind: "static" }
  /** Tire width is driven by the component's `tire_width_mm` attribute (Z-scale). */
  | { kind: "tire-width"; baseWidthMm: number; minWidthMm: number; maxWidthMm: number };

export interface SlotMapping {
  /** Exact mesh names in the GLB. Validated by tests against the asset. */
  meshes: string[];
  /** Point the camera focuses on when the slot is selected. */
  focus: Vec3;
  visual: SlotVisual;
}

export interface BikeModelMeta {
  key: string;
  label: string;
  url: string;
  /** True for procedural / stand-in assets. Always surfaced in the UI. */
  placeholder: boolean;
  description: string;
  license: string;
  /** Meshes painted with the bicycle's colour (bicycles.color_hex). */
  paintMeshes: string[];
  slots: Partial<Record<BikeSlot, SlotMapping>>;
  cameraPresets: CameraPreset[];
  defaultPreset: string;
  /** Approximate bounding box centre, used as the default orbit target. */
  center: Vec3;
}
