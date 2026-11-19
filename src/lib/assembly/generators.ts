/**
 * Parametric generators (velox-assembly/1). Each generator:
 *  - declares the same mount/anchor contract as an authored asset of that kind,
 *  - builds geometry ONLY from recorded catalog dimensions (required ones must be present),
 *  - lists every modelling assumption and cosmetic default it used, so the UI can show
 *    which values are data and which are representation choices.
 * Deterministic: same params → same vertices (fingerprint-stable).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GENERATOR_REQUIREMENTS } from "./conventions";
import { IDENTITY, interfaceFrame } from "./math";
import type { AnchorDecl, GeneratorId, MaterialRole, MountDecl } from "./spec";

export const GENERATOR_VERSIONS: Record<GeneratorId, number> = { wheel: 1, tire: 1 };

export interface GeneratorResolution {
  ok: boolean;
  missing: string[];
  params: Record<string, number>;
  assumptions: string[];
  mounts: Record<string, MountDecl>;
  anchors: Record<string, AnchorDecl>;
  /** Radius of the outermost geometry in the wheel plane (m): rim bead or tire tread. */
  outerRadiusM: number;
}

export interface GeneratedPart {
  role: MaterialRole;
  name: string;
  geometry: THREE.BufferGeometry;
}

/** Bound every generator input: rejects absurd values instead of building huge geometry. */
const BOUNDS: Record<string, [number, number]> = {
  bsd_mm: [200, 700],
  width_mm: [16, 130],
  outer_diameter_mm: [250, 800],
  rim_depth_mm: [8, 90],
  rim_width_mm: [12, 110],
  spoke_count: [12, 48],
  old_mm: [74, 197],
};

function readNumber(dims: Record<string, unknown>, key: string): number | null {
  const v = dims[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const b = BOUNDS[key];
  if (b && (n < b[0] || n > b[1])) return null;
  return n;
}

const AXLE_MOUNT = (): MountDecl => ({ node: "MNT__hub_axle", type: "axle", pose: interfaceFrame("axle", [0, 0, 0], [0, 0, 1]) });

export function resolveWheel(dims: Record<string, unknown>, position: "front" | "rear"): GeneratorResolution {
  const missing = GENERATOR_REQUIREMENTS.wheel.required.filter((k) => readNumber(dims, k) === null);
  const assumptions: string[] = [];
  const bsd = readNumber(dims, "bsd_mm") ?? 0;
  const pick = (key: string, fallback: number, label: string) => {
    const v = readNumber(dims, key);
    if (v !== null) return v;
    assumptions.push(`${label} not recorded — a generic value (${fallback}${key.endsWith("_count") ? "" : " mm"}) is used for display only, not as data`);
    return fallback;
  };
  const params: Record<string, number> = {
    bsd_mm: bsd,
    rim_depth_mm: pick("rim_depth_mm", 25, "Rim depth"),
    rim_width_mm: pick("rim_width_mm", 24, "Rim width"),
    spoke_count: Math.round(pick("spoke_count", 24, "Spoke count")),
    old_mm: pick("old_mm", position === "front" ? 100 : 142, "Hub spacing"),
  };
  const anchors: Record<string, AnchorDecl> = {
    bead: { node: "ANC__bead", type: "bead", pose: interfaceFrame("bead", [0, 0, 0], [0, 0, 1]), standard: `bsd_${bsd}` },
  };
  if (position === "rear") anchors.freehub = { node: "ANC__freehub", type: "spline", pose: interfaceFrame("spline", [0, 0, 0.02], [0, 0, 1]) };
  return { ok: missing.length === 0, missing, params, assumptions, mounts: { hub_axle: AXLE_MOUNT() }, anchors, outerRadiusM: bsd / 2000 };
}

/** Casing height model used when the outer diameter is not recorded. */
export const TIRE_HEIGHT_RATIO = 0.94;

export function resolveTire(dims: Record<string, unknown>): GeneratorResolution {
  const missing = GENERATOR_REQUIREMENTS.tire.required.filter((k) => readNumber(dims, k) === null);
  const assumptions: string[] = [];
  const width = readNumber(dims, "width_mm") ?? 0;
  const bsd = readNumber(dims, "bsd_mm") ?? 0;
  const outer = readNumber(dims, "outer_diameter_mm");
  let height: number;
  if (outer !== null && outer > bsd) height = (outer - bsd) / 2;
  else {
    height = width * TIRE_HEIGHT_RATIO;
    if (width > 0) assumptions.push(`Outer diameter not recorded — casing height modelled as ${TIRE_HEIGHT_RATIO} × width (VELOX model, not a manufacturer value)`);
  }
  assumptions.push("Tread pattern not modelled (smooth casing, cosmetic)");
  const params = { width_mm: width, bsd_mm: bsd, height_mm: Math.round(height * 10) / 10 };
  return {
    ok: missing.length === 0,
    missing,
    params,
    assumptions,
    mounts: { bead: { node: "MNT__bead", type: "bead", pose: { ...IDENTITY }, standard: `bsd_${bsd}` } },
    anchors: {},
    outerRadiusM: (bsd / 2 + height) / 1000,
  };
}

/* ------------------------------------------------------------------------------------ */
/* Geometry (deterministic). Wheel plane = XY, axle = Z, origin = hub centre.            */
/* ------------------------------------------------------------------------------------ */

function lathe(profile: [number, number][], segments: number): THREE.BufferGeometry {
  // LatheGeometry revolves around +Y; points are (radius, axial). Rotate so the axis is +Z.
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

export function buildWheel(params: Record<string, number>): GeneratedPart[] {
  const R = params.bsd_mm / 2000;
  const depth = params.rim_depth_mm / 1000;
  const w = params.rim_width_mm / 1000 + 0.004;
  const rim = lathe(
    [
      [R - depth, -w * 0.3], [R - 0.004, -w / 2], [R + 0.003, -w / 2], [R + 0.003, w / 2],
      [R - 0.004, w / 2], [R - depth, w * 0.3], [R - depth, -w * 0.3],
    ],
    96,
  );
  const half = params.old_mm / 2000;
  const hub = new THREE.CylinderGeometry(0.019, 0.019, half * 2, 24);
  hub.rotateX(Math.PI / 2);
  const flangeL = new THREE.CylinderGeometry(0.03, 0.03, 0.003, 24).rotateX(Math.PI / 2).translate(0, 0, -half * 0.75);
  const flangeR = new THREE.CylinderGeometry(0.03, 0.03, 0.003, 24).rotateX(Math.PI / 2).translate(0, 0, half * 0.75);
  const spokes: THREE.BufferGeometry[] = [];
  const n = params.spoke_count;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const side = i % 2 === 0 ? 1 : -1;
    const from = new THREE.Vector3(Math.cos(a) * 0.028, Math.sin(a) * 0.028, side * half * 0.75);
    const to = new THREE.Vector3(Math.cos(a + 0.12) * (R - depth), Math.sin(a + 0.12) * (R - depth), 0);
    const dir = to.clone().sub(from);
    const s = new THREE.CylinderGeometry(0.001, 0.001, dir.length(), 5);
    s.translate(0, dir.length() / 2, 0);
    s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    s.translate(from.x, from.y, from.z);
    spokes.push(s);
  }
  const strip = (g: THREE.BufferGeometry) => {
    g.deleteAttribute("uv");
    return g;
  };
  return [
    { role: "metal", name: "rim", geometry: strip(rim) },
    { role: "metal", name: "hub", geometry: strip(mergeGeometries([hub, flangeL, flangeR].map(strip))!) },
    { role: "metal", name: "spokes", geometry: strip(mergeGeometries(spokes.map(strip))!) },
  ];
}

export function buildTire(params: Record<string, number>): GeneratedPart[] {
  const R = params.bsd_mm / 2000;
  const h = params.height_mm / 1000;
  const w = params.width_mm / 1000;
  // Casing cross-section: a superellipse from bead to bead, revolved around the axle.
  const profile: [number, number][] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (i / steps) * Math.PI; // -90° (one bead) … +90° (other bead)
    const s = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 0.8);
    const c = Math.pow(Math.abs(Math.cos(t)), 0.7);
    profile.push([R + h * c, (w / 2) * s]);
  }
  const g = lathe(profile, 96);
  g.deleteAttribute("uv");
  return [{ role: "rubber", name: "casing", geometry: g }];
}
