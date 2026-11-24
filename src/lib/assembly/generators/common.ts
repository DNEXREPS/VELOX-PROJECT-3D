/**
 * Shared generator infrastructure (velox-assembly/1).
 *
 * Every generator: declares required catalog dimensions (missing → no geometry), builds
 * deterministic geometry in the standard part axes (+X forward, +Y up, +Z drive side),
 * declares mounts/anchors following the interface conventions, and lists every
 * representation choice that is not data ("assumptions").
 */
import * as THREE from "three";
import type { AnchorDecl, GeneratorId, GeneratorParams, MaterialRole, MountDecl } from "../spec";

export type Dims = Record<string, unknown>;

export interface GeneratorResolution {
  ok: boolean;
  missing: string[];
  params: GeneratorParams;
  assumptions: string[];
  mounts: Record<string, MountDecl>;
  anchors: Record<string, AnchorDecl>;
  /** Radius of the outermost geometry in the wheel plane (wheels/tires only). */
  outerRadiusM?: number;
}

export interface GeneratedPart {
  role: MaterialRole;
  name: string;
  geometry: THREE.BufferGeometry;
}

/** Side-view primitive in part space (metres, x forward, y up); the projection applies the node's world pose. */
export type Prim2D = { kind: "polyline"; points: [number, number, number][]; closed?: boolean } | { kind: "circle"; center: [number, number, number]; r: number };

export interface GeneratorDef {
  id: GeneratorId;
  version: number;
  required: string[];
  resolve(dims: Dims, ctx: { position?: "front" | "rear"; variant?: string }): GeneratorResolution;
  build(params: GeneratorParams): GeneratedPart[];
  /** 2D side profile from the SAME params as build() — no separate 2D geometry logic. */
  profile2d(params: GeneratorParams): Prim2D[];
}

/** Plausibility bounds: values outside are treated as invalid data, never built. */
export const BOUNDS: Record<string, [number, number]> = {
  bsd_mm: [200, 700],
  width_mm: [16, 130],
  outer_diameter_mm: [250, 800],
  rim_depth_mm: [8, 90],
  rim_width_mm: [12, 110],
  spoke_count: [12, 48],
  old_mm: [74, 197],
  length_mm: [30, 500],
  angle_deg: [-45, 45],
  steerer_clamp_mm: [20, 40],
  bar_clamp_mm: [20, 40],
  reach_mm: [20, 140],
  drop_mm: [60, 180],
  flare_deg: [0, 40],
  rise_mm: [0, 100],
  backsweep_deg: [0, 45],
  bar_width_mm: [300, 900],
  diameter_mm: [20, 40],
  setback_mm: [0, 40],
  crank_length_mm: [80, 200],
  teeth: [9, 60],
  speeds: [1, 13],
  rotor_mm: [100, 230],
};

export function num(dims: Dims, key: string, bound = key): number | null {
  const v = dims[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const b = BOUNDS[bound];
  if (b && (n < b[0] || n > b[1])) return null;
  return n;
}

/** Integer list from "50,34" / [50, 34]; every entry must be within bounds. */
export function list(dims: Dims, key: string, bound: string): number[] | null {
  const v = dims[key];
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,/–-]/) : null;
  if (!raw) return null;
  const out = raw.map((x) => Number(String(x).trim())).filter((x) => Number.isFinite(x));
  if (out.length === 0 || out.length !== raw.length) return null;
  const b = BOUNDS[bound];
  if (b && out.some((x) => x < b[0] || x > b[1])) return null;
  return out;
}

export const assume = (out: string[], text: string) => out.push(text);

/** Chain pitch 12.7 mm: pitch-circle radius of a sprocket with `teeth` teeth (metres). */
export const sprocketRadius = (teeth: number) => 0.0127 / (2 * Math.sin(Math.PI / teeth));

export function lathe(profile: [number, number][], segments: number): THREE.BufferGeometry {
  // LatheGeometry revolves around +Y; profile points are (radius, axial). Rotate so axis = +Z.
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

export function tube(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2 = r1, segments = 12): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r2, r1, dir.length(), segments, 1, false);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Flat ring (annulus) in the XY plane with thickness along Z, centred at z. */
export function ring(outer: number, inner: number, thickness: number, z: number, segments = 48): THREE.BufferGeometry {
  return lathe(
    [
      [inner, z - thickness / 2],
      [outer, z - thickness / 2],
      [outer, z + thickness / 2],
      [inner, z + thickness / 2],
      [inner, z - thickness / 2],
    ],
    segments,
  );
}

export function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  return g;
}

/** Round to 0.1 mm-equivalent precision so params (and fingerprints) are stable. */
export const r1 = (n: number) => Math.round(n * 10) / 10;
