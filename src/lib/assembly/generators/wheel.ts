import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { interfaceFrame } from "../math";
import type { AnchorDecl } from "../spec";
import { assume, lathe, num, strip, type GeneratorDef } from "./common";

/** Hub spacing (OLD) from an axle standard string, e.g. "12x142_ta" → 142, "130_qr" → 130. */
export function oldFromAxle(standard: unknown): number | null {
  if (typeof standard !== "string") return null;
  const m = /(?:^|x)(\d{3})(?:_|$)/.exec(standard);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 74 && n <= 197 ? n : null;
}

/**
 * Wheel (rim, hub, spokes) — one per position. Required: bead seat diameter.
 * Rim depth/width, spoke count and hub spacing come from data when recorded; otherwise a
 * generic display value is used and listed as an assumption. Disc wheels expose a rotor
 * mount on the non-drive side.
 */
export const wheel: GeneratorDef = {
  id: "wheel",
  version: 2,
  required: ["bsd_mm"],
  resolve(dims, { position = "front" }) {
    const assumptions: string[] = [];
    const bsd = num(dims, "bsd_mm");
    const missing = bsd === null ? ["bsd_mm"] : [];
    const pick = (key: string, fallback: number, label: string, bound = key) => {
      const v = num(dims, key, bound);
      if (v !== null) return v;
      assume(assumptions, `${label} not recorded — a generic value (${fallback}${key.endsWith("_count") ? "" : " mm"}) is used for display only, not as data`);
      return fallback;
    };
    const oldRecorded = oldFromAxle(position === "front" ? dims.front_axle : dims.rear_axle);
    const old = oldRecorded ?? pick("old_mm", position === "front" ? 100 : 142, "Hub spacing");
    const disc = dims.brake_type === "disc" ? 1 : 0;
    const params = {
      bsd_mm: bsd ?? 0,
      rim_depth_mm: pick("rim_depth_mm", 25, "Rim depth"),
      rim_width_mm: pick("rim_width_mm", 24, "Rim width"),
      spoke_count: Math.round(pick("spoke_count", 24, "Spoke count")),
      old_mm: old,
      disc,
    };
    if (num(dims, "rim_width_mm") !== null && dims.rim_width_is_internal) assume(assumptions, "Rim external width not recorded — internal width + 4 mm modelled");
    const anchors: Record<string, AnchorDecl> = {
      bead: { node: "ANC__bead", type: "bead", pose: interfaceFrame("bead", [0, 0, 0], [0, 0, 1]), standard: `bsd_${params.bsd_mm}` },
    };
    if (position === "rear") anchors.freehub = { node: "ANC__freehub", type: "spline", pose: interfaceFrame("spline", [0, 0, 0.018], [0, 0, 1]) };
    if (disc) {
      // Rotors sit on the non-drive side; the interface axis still points to the drive side.
      anchors.rotor = { node: "ANC__rotor", type: "spline", pose: interfaceFrame("spline", [0, 0, -(old / 2000 - 0.0145)], [0, 0, 1]) };
      assume(assumptions, "Rotor position on the hub modelled from hub spacing (display only)");
    }
    return {
      ok: missing.length === 0,
      missing,
      params,
      assumptions,
      mounts: { hub_axle: { node: "MNT__hub_axle", type: "axle", pose: interfaceFrame("axle", [0, 0, 0], [0, 0, 1]) } },
      anchors,
      outerRadiusM: (bsd ?? 0) / 2000,
    };
  },
  profile2d(p) {
    const R = (p.bsd_mm as number) / 2000;
    return [{ kind: "circle", center: [0, 0, 0], r: R }, { kind: "circle", center: [0, 0, 0], r: R - (p.rim_depth_mm as number) / 1000 }];
  },
  build(p) {
    const R = (p.bsd_mm as number) / 2000;
    const depth = (p.rim_depth_mm as number) / 1000;
    const w = (p.rim_width_mm as number) / 1000 + 0.004;
    const rim = lathe(
      [
        [R - depth, -w * 0.3], [R - 0.004, -w / 2], [R + 0.003, -w / 2], [R + 0.003, w / 2],
        [R - 0.004, w / 2], [R - depth, w * 0.3], [R - depth, -w * 0.3],
      ],
      96,
    );
    const half = (p.old_mm as number) / 2000;
    const hub = new THREE.CylinderGeometry(0.019, 0.019, half * 2, 24).rotateX(Math.PI / 2);
    const flangeL = new THREE.CylinderGeometry(0.03, 0.03, 0.003, 24).rotateX(Math.PI / 2).translate(0, 0, -half * 0.75);
    const flangeR = new THREE.CylinderGeometry(0.03, 0.03, 0.003, 24).rotateX(Math.PI / 2).translate(0, 0, half * 0.75);
    const spokes: THREE.BufferGeometry[] = [];
    const n = p.spoke_count as number;
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
    return [
      { role: "metal", name: "rim", geometry: strip(rim) },
      { role: "metal", name: "hub", geometry: strip(mergeGeometries([hub, flangeL, flangeR].map(strip))!) },
      { role: "metal", name: "spokes", geometry: strip(mergeGeometries(spokes.map(strip))!) },
    ];
  },
};
