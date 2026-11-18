"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { BikeSlot } from "@/lib/domain/slots";
import { buildMeshIndex, tireScale } from "../models/registry";
import type { BikeModelMeta } from "../models/types";
import { SCENE_COLORS } from "./colors";

export interface BikeModelVisualState {
  selectedSlot: BikeSlot | null;
  hoveredSlot: BikeSlot | null;
  pendingSlots: BikeSlot[];
  recordedSlots: BikeSlot[] | null;
  ghostUnrecorded: boolean;
  paintColor: string | null;
  tireWidthMm: { front?: number; rear?: number };
}

interface Props extends BikeModelVisualState {
  meta: BikeModelMeta;
  interactive: boolean;
  onHover: (slot: BikeSlot | null) => void;
  onSelect: (slot: BikeSlot | null) => void;
}

interface MeshEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  slot: BikeSlot | null;
  baseColor: THREE.Color;
  paint: boolean;
}

const selectedColor = new THREE.Color(SCENE_COLORS.selected);
const pendingColor = new THREE.Color(SCENE_COLORS.pending);
const hoverColor = new THREE.Color(SCENE_COLORS.hover);
const black = new THREE.Color(0, 0, 0);

/**
 * Loads the GLB, clones it (so the cached asset is never mutated) and applies
 * visual state through explicit mesh→slot metadata — never by guessing names.
 */
export function BikeModel({ meta, interactive, onHover, onSelect, ...state }: Props) {
  const gltf = useGLTF(meta.url, false, false);
  const invalidate = useThree((s) => s.invalidate);
  const meshIndex = useMemo(() => buildMeshIndex(meta), [meta]);

  const { scene, entries } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const paint = new Set(meta.paintMeshes);
    const entries: MeshEntry[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const material = (source as THREE.MeshStandardMaterial).clone();
      mesh.material = material;
      entries.push({ mesh, material, slot: meshIndex.get(mesh.name) ?? null, baseColor: material.color.clone(), paint: paint.has(mesh.name) });
    });
    return { scene, entries };
  }, [gltf.scene, meshIndex, meta.paintMeshes]);

  // Three.js objects are mutated imperatively (the idiomatic R3F pattern); keep them in a ref
  // so React state stays immutable.
  const entriesRef = useRef<MeshEntry[]>([]);
  useLayoutEffect(() => {
    entriesRef.current = entries;
    // Dispose cloned materials. Geometry is shared with the GLTF cache and released with it.
    return () => entries.forEach((e) => e.material.dispose());
  }, [entries]);

  const { selectedSlot, hoveredSlot, pendingSlots, recordedSlots, ghostUnrecorded, paintColor, tireWidthMm } = state;
  const pendingKey = pendingSlots.join(",");
  const recordedKey = recordedSlots?.join(",") ?? "";

  useLayoutEffect(() => {
    applyVisualState(entriesRef.current, meta, {
      selectedSlot,
      hoveredSlot,
      pending: new Set(pendingKey ? pendingKey.split(",") : []),
      recorded: recordedSlots ? new Set(recordedKey ? recordedKey.split(",") : []) : null,
      ghostUnrecorded,
      paintColor,
      tireWidthMm: { front: tireWidthMm.front, rear: tireWidthMm.rear },
    });
    invalidate();
  }, [entries, selectedSlot, hoveredSlot, pendingKey, recordedKey, recordedSlots, ghostUnrecorded, paintColor, tireWidthMm.front, tireWidthMm.rear, meta, invalidate]);

  const slotOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => meshIndex.get(e.object.name) ?? null;

  return (
    <primitive
      object={scene}
      onPointerMove={
        interactive
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              const slot = slotOf(e);
              document.body.style.cursor = slot ? "pointer" : "auto";
              if (slot !== hoveredSlot) onHover(slot);
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              document.body.style.cursor = "auto";
              onHover(null);
            }
          : undefined
      }
      onClick={
        interactive
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              // Ignore clicks that ended a drag (orbit) gesture.
              if (e.delta > 4) return;
              onSelect(slotOf(e));
            }
          : undefined
      }
    />
  );
}

interface AppliedState {
  selectedSlot: BikeSlot | null;
  hoveredSlot: BikeSlot | null;
  pending: Set<string>;
  recorded: Set<string> | null;
  ghostUnrecorded: boolean;
  paintColor: string | null;
  tireWidthMm: { front?: number; rear?: number };
}

/** Imperatively apply selection / preview state to the cloned Three.js materials and meshes. */
function applyVisualState(entries: MeshEntry[], meta: BikeModelMeta, state: AppliedState) {
  const { selectedSlot, hoveredSlot, pending, recorded, ghostUnrecorded, paintColor, tireWidthMm } = state;
  const paint = paintColor && /^#[0-9a-fA-F]{6}$/.test(paintColor) ? new THREE.Color(paintColor) : null;

  for (const e of entries) {
    const m = e.material;
    m.color.copy(e.paint && paint ? paint : e.baseColor);

    if (e.slot && e.slot === selectedSlot) {
      m.emissive.copy(selectedColor);
      m.emissiveIntensity = 0.55;
    } else if (e.slot && pending.has(e.slot)) {
      m.emissive.copy(pendingColor);
      m.emissiveIntensity = 0.16;
    } else if (e.slot && e.slot === hoveredSlot) {
      m.emissive.copy(hoverColor);
      m.emissiveIntensity = 0.14;
    } else {
      m.emissive.copy(black);
      m.emissiveIntensity = 0;
    }

    const ghost = ghostUnrecorded && recorded !== null && e.slot !== null && !recorded.has(e.slot) && e.slot !== selectedSlot && !pending.has(e.slot);
    if (m.transparent !== ghost) {
      m.transparent = ghost;
      m.needsUpdate = true;
    }
    m.opacity = ghost ? 0.16 : 1;
    m.depthWrite = !ghost;

    if (e.slot === "front_tire" || e.slot === "rear_tire") {
      const mapping = meta.slots[e.slot];
      const width = e.slot === "front_tire" ? tireWidthMm.front : tireWidthMm.rear;
      e.mesh.scale.z =
        mapping?.visual.kind === "tire-width"
          ? tireScale(width, mapping.visual.baseWidthMm, mapping.visual.minWidthMm, mapping.visual.maxWidthMm)
          : 1;
    }
  }
}
