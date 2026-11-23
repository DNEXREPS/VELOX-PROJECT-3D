/**
 * Drivetrain and brake generators: crankset, cassette, chain (derived), rotor.
 * Sprocket sizes are exact from teeth counts (chain pitch 12.7 mm); spacing standards
 * that are not part of the catalog data are listed as assumptions.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { interfaceFrame } from "../math";
import type { AnchorDecl } from "../spec";
import { assume, list, num, r1, ring, sprocketRadius, strip, tube, type GeneratorDef } from "./common";

/** Road chainline used to place chainrings when not recorded (display). */
export const CHAINLINE_MM = 43.5;
/** Cog pitch along the freehub by speed count (display; not catalog data). */
export const COG_PITCH_MM: Record<number, number> = { 8: 4.8, 9: 4.35, 10: 3.95, 11: 3.74, 12: 3.5, 13: 3.3 };

/**
 * Crankset. Required: crank length and chainring teeth. Crank arms are drawn horizontal
 * (drive arm forward) — a display pose, not data. Pedal anchors sit exactly at crank length.
 */
export const crankset: GeneratorDef = {
  id: "crankset",
  version: 1,
  required: ["crank_length_mm", "chainrings"],
  resolve(dims) {
    const assumptions: string[] = [];
    const length = num(dims, "crank_length_mm");
    const rings = list(dims, "chainrings", "teeth");
    const missing = [length === null && "crank_length_mm", rings === null && "chainrings"].filter(Boolean) as string[];
    const sorted = (rings ?? []).slice().sort((a, b) => b - a);
    assume(assumptions, `Chainline not recorded — rings centred on ${CHAINLINE_MM} mm, 5.5 mm apart (display)`);
    assume(assumptions, "Crank arms drawn horizontal (display pose)");
    const params = { crank_length_mm: length ?? 0, chainrings: sorted };
    const L = (length ?? 0) / 1000;
    const zBig = (CHAINLINE_MM + ((sorted.length - 1) * 5.5) / 2) / 1000;
    const anchors: Record<string, AnchorDecl> = {
      pedal_r: { node: "ANC__pedal_r", type: "thread", pose: interfaceFrame("thread", [L, 0, 0.075], [0, 0, 1]) },
      pedal_l: { node: "ANC__pedal_l", type: "thread", pose: interfaceFrame("thread", [-L, 0, -0.075], [0, 0, -1]) },
      ring_big: { node: "ANC__ring_big", type: "face", pose: interfaceFrame("face", [0, 0, zBig], [0, 0, 1]) },
    };
    return {
      ok: missing.length === 0,
      missing,
      params,
      assumptions,
      mounts: { spindle: { node: "MNT__spindle", type: "spindle", pose: interfaceFrame("spindle", [0, 0, 0], [0, 0, 1]) } },
      anchors,
    };
  },
  profile2d(p) {
    const L = (p.crank_length_mm as number) / 1000;
    const rings = p.chainrings as number[];
    return [...rings.map((t) => ({ kind: "circle" as const, center: [0, 0, 0] as [number, number, number], r: sprocketRadius(t) })), { kind: "polyline", points: [[-L, 0, 0], [L, 0, 0]] }];
  },
  build(p) {
    const L = (p.crank_length_mm as number) / 1000;
    const rings = p.chainrings as number[];
    const pieces: THREE.BufferGeometry[] = [];
    rings.forEach((teeth, i) => {
      const z = (CHAINLINE_MM + ((rings.length - 1) * 5.5) / 2 - i * 5.5) / 1000;
      const R = sprocketRadius(teeth);
      pieces.push(ring(R + 0.004, R - 0.012, 0.002, z, Math.max(48, teeth * 2)));
    });
    pieces.push(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 16).rotateX(Math.PI / 2));
    pieces.push(tube(new THREE.Vector3(0, 0, 0.062), new THREE.Vector3(L, 0, 0.07), 0.012, 0.009, 10));
    pieces.push(tube(new THREE.Vector3(0, 0, -0.062), new THREE.Vector3(-L, 0, -0.07), 0.012, 0.009, 10));
    return [{ role: "metal", name: "crankset", geometry: strip(mergeGeometries(pieces.map(strip))!) }];
  },
};

/** Cassette. Required: cog teeth list. Cog spacing from the speed count (listed). */
export const cassette: GeneratorDef = {
  id: "cassette",
  version: 1,
  required: ["cogs"],
  resolve(dims) {
    const assumptions: string[] = [];
    const cogs = list(dims, "cogs", "teeth");
    const missing = cogs === null ? ["cogs"] : [];
    const sorted = (cogs ?? []).slice().sort((a, b) => b - a);
    const speeds = sorted.length;
    const pitch = COG_PITCH_MM[speeds] ?? 3.9;
    assume(assumptions, `Cog spacing not recorded — ${pitch} mm (${speeds}-speed standard) shown`);
    const zLargest = 0.0016;
    const zSmallest = zLargest + ((speeds - 1) * pitch) / 1000;
    return {
      ok: missing.length === 0,
      missing,
      params: { cogs: sorted, pitch_mm: pitch },
      assumptions,
      mounts: { freehub: { node: "MNT__freehub", type: "spline", pose: interfaceFrame("spline", [0, 0, 0], [0, 0, 1]) } },
      anchors: {
        cog_smallest: { node: "ANC__cog_smallest", type: "face", pose: interfaceFrame("face", [0, 0, zSmallest], [0, 0, 1]) },
        cog_largest: { node: "ANC__cog_largest", type: "face", pose: interfaceFrame("face", [0, 0, zLargest], [0, 0, 1]) },
      },
    };
  },
  profile2d(p) {
    const cogs = p.cogs as number[];
    return [cogs[0], cogs[cogs.length - 1]].map((t) => ({ kind: "circle" as const, center: [0, 0, 0] as [number, number, number], r: sprocketRadius(t) }));
  },
  build(p) {
    const cogs = p.cogs as number[];
    const pitch = (p.pitch_mm as number) / 1000;
    const pieces = cogs.map((teeth, i) => {
      const R = sprocketRadius(teeth);
      return ring(R + 0.003, Math.max(0.018, R - 0.008), 0.0016, 0.0016 + i * pitch, Math.max(32, teeth * 2));
    });
    return [{ role: "metal", name: "cassette", geometry: strip(mergeGeometries(pieces.map(strip))!) }];
  },
};

/**
 * Chain (derived). Required: speed count (width). The path is computed from the actual
 * largest chainring and smallest cog positions/radii in the assembly; the derailleur cage
 * is not modelled, so the lower run is drawn straight (listed).
 */
export const chain: GeneratorDef = {
  id: "chain",
  version: 1,
  required: ["speeds"],
  resolve(dims) {
    const speeds = num(dims, "speeds");
    const assumptions = ["Shown on the largest chainring and smallest cog", "Rear derailleur path not modelled — lower run drawn straight"];
    return { ok: speeds !== null, missing: speeds === null ? ["speeds"] : [], params: { speeds: speeds ?? 0 }, assumptions, mounts: {}, anchors: {} };
  },
  /** Params (world, mm): ring_x/y/z, ring_r, cog_x/y/z, cog_r, speeds. Node world pose is identity. */
  profile2d(p) {
    return [{ kind: "polyline", points: chainPath(p).map((v) => [v.x, v.y, v.z] as [number, number, number]), closed: true }];
  },
  build(p) {
    const curve = new THREE.CatmullRomCurve3(chainPath(p), true, "centripetal");
    return [{ role: "metal", name: "chain", geometry: strip(new THREE.TubeGeometry(curve, 220, 0.0028, 5, true)) }];
  },
};

/**
 * Chain loop (shared by build and profile): external tangents between the largest ring
 * and the smallest cog; short arc round the back of the cog, long arc round the front of
 * the ring; straight upper and lower runs.
 */
export function chainPath(p: Record<string, number | number[]>): THREE.Vector3[] {
  const c1 = new THREE.Vector2((p.ring_x as number) / 1000, (p.ring_y as number) / 1000);
  const c2 = new THREE.Vector2((p.cog_x as number) / 1000, (p.cog_y as number) / 1000);
  const rA = (p.ring_r as number) / 1000;
  const rB = (p.cog_r as number) / 1000;
  const z1 = (p.ring_z as number) / 1000;
  const z2 = (p.cog_z as number) / 1000;
  const d = c2.clone().sub(c1);
  const phi = Math.atan2(d.y, d.x);
  const alpha = Math.acos(THREE.MathUtils.clamp((rA - rB) / d.length(), -1, 1));
  const nA = phi + alpha;
  const nB = phi - alpha;
  const up = Math.sin(nA) > Math.sin(nB) ? nA : nB;
  const low = up === nA ? nB : nA;
  const pts: THREE.Vector3[] = [];
  const arc = (c: THREE.Vector2, r: number, from: number, delta: number, z: number, steps: number) => {
    for (let i = 0; i <= steps; i++) {
      const t = from + (delta * i) / steps;
      pts.push(new THREE.Vector3(c.x + r * Math.cos(t), c.y + r * Math.sin(t), z));
    }
  };
  const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  arc(c2, rB, up, norm(low - up), z2, 18);
  const short = norm(up - low);
  arc(c1, rA, low, short - Math.sign(short) * Math.PI * 2, z1, 48);
  return pts;
}

/** Brake rotor. Required: diameter. */
export const rotor: GeneratorDef = {
  id: "rotor",
  version: 1,
  required: ["diameter_mm"],
  resolve(dims) {
    const d = num(dims, "diameter_mm", "rotor_mm");
    return {
      ok: d !== null,
      missing: d === null ? ["diameter_mm"] : [],
      params: { diameter_mm: d ?? 0 },
      assumptions: ["Spider and vent pattern not modelled (cosmetic)"],
      mounts: { hub: { node: "MNT__hub", type: "spline", pose: interfaceFrame("spline", [0, 0, 0], [0, 0, 1]) } },
      anchors: {},
    };
  },
  profile2d(p) {
    return [{ kind: "circle", center: [0, 0, 0], r: (p.diameter_mm as number) / 2000 }];
  },
  build(p) {
    const R = (p.diameter_mm as number) / 2000;
    const band = ring(R, R - 0.017, 0.0018, 0, 72);
    const spider = ring(0.032, 0.02, 0.003, 0, 24);
    const arms = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return tube(new THREE.Vector3(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0), new THREE.Vector3(Math.cos(a + 0.35) * (R - 0.016), Math.sin(a + 0.35) * (R - 0.016), 0), 0.003, 0.003, 6);
    });
    return [{ role: "metal", name: "rotor", geometry: strip(mergeGeometries([band, spider, ...arms].map(strip))!) }];
  },
};

/** Round world-derived chain params for stable fingerprints. */
export const chainParams = (p: Record<string, number>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r1(v)]));
