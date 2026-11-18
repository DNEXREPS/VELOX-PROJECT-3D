import type { BikeSlot } from "@/lib/domain/slots";
import type { BikeModelMeta } from "./types";
import { veloxPlaceholderRoad } from "./velox-placeholder-road";

/**
 * Registry of available 3D bicycle models. Add production assets here with their
 * own explicit mesh mapping (see docs/3d-assets.md). bicycles.model_key references
 * a key in this registry; unknown keys fall back to the default model.
 */
export const MODELS: Record<string, BikeModelMeta> = {
  [veloxPlaceholderRoad.key]: veloxPlaceholderRoad,
};

export const DEFAULT_MODEL_KEY = veloxPlaceholderRoad.key;

export function getModelMeta(key: string | null | undefined): BikeModelMeta {
  return (key && MODELS[key]) || MODELS[DEFAULT_MODEL_KEY];
}

/** Reverse index: mesh name → slot. Built once per model. */
export function buildMeshIndex(meta: BikeModelMeta): Map<string, BikeSlot> {
  const index = new Map<string, BikeSlot>();
  for (const [slot, mapping] of Object.entries(meta.slots) as [BikeSlot, NonNullable<BikeModelMeta["slots"][BikeSlot]>][]) {
    for (const mesh of mapping.meshes) {
      if (index.has(mesh)) throw new Error(`Mesh ${mesh} mapped to more than one slot in ${meta.key}`);
      index.set(mesh, slot);
    }
  }
  return index;
}

export function slotHasGeometry(meta: BikeModelMeta, slot: BikeSlot): boolean {
  return (meta.slots[slot]?.meshes.length ?? 0) > 0;
}

/** Clamp + compute the Z scale for a parametric tire width preview. */
export function tireScale(widthMm: number | undefined, base: number, min: number, max: number): number {
  if (widthMm === undefined || !Number.isFinite(widthMm)) return 1;
  return Math.min(max, Math.max(min, widthMm)) / base;
}
