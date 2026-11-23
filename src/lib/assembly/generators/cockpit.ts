/**
 * Cockpit and seat generators: stem, handlebar (drop / flat families), seatpost.
 * Part axes: +X forward, +Y up (stem/post: along the steerer / seat tube), +Z drive side.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { frameFromAxis, interfaceFrame } from "../math";
import { assume, num, strip, tube, type GeneratorDef } from "./common";

/** Stem clamp stack height (display), not usually published. */
export const STEM_STACK_MM = 40;

/**
 * Stem. Required: length (mm) and angle (degrees, relative to the perpendicular of the
 * steerer; negative points down). The bar-clamp centre is placed exactly at that length
 * and angle from the steerer axis at mid clamp height.
 */
export const stem: GeneratorDef = {
  id: "stem",
  version: 1,
  required: ["length_mm", "angle_deg"],
  resolve(dims) {
    const assumptions: string[] = [];
    const length = num(dims, "length_mm");
    const angle = num(dims, "angle_deg");
    const missing = [length === null && "length_mm", angle === null && "angle_deg"].filter(Boolean) as string[];
    const steererRecorded = num(dims, "steerer_clamp_mm");
    const barRecorded = num(dims, "bar_clamp_mm");
    const steerer = steererRecorded ?? (assume(assumptions, "Steerer clamp diameter not recorded — 28.6 mm shown"), 28.6);
    const bar = barRecorded ?? (assume(assumptions, "Handlebar clamp diameter not recorded — 31.8 mm shown"), 31.8);
    assume(assumptions, `Stem clamp stack height not recorded — ${STEM_STACK_MM} mm shown`);
    const params = { length_mm: length ?? 0, angle_deg: angle ?? 0, steerer_clamp_mm: steerer, bar_clamp_mm: bar, stack_mm: STEM_STACK_MM };
    const a = THREE.MathUtils.degToRad(params.angle_deg);
    const c: [number, number, number] = [(params.length_mm / 1000) * Math.cos(a), STEM_STACK_MM / 2000 + (params.length_mm / 1000) * Math.sin(a), 0];
    return {
      ok: missing.length === 0,
      missing,
      params,
      assumptions,
      mounts: { steerer_clamp: { node: "MNT__steerer_clamp", type: "tube", pose: interfaceFrame("tube", [0, 0, 0], [0, 1, 0]), standard: steererRecorded === null ? undefined : String(steerer) } },
      // Interface standards only from recorded data — a display default is never compared.
      anchors: { bar_clamp: { node: "ANC__bar_clamp", type: "clamp", pose: frameFromAxis(c, [0, 0, 1], [0, 1, 0]), standard: barRecorded === null ? undefined : String(bar) } },
    };
  },
  profile2d(p) {
    const L = (p.length_mm as number) / 1000;
    const a = THREE.MathUtils.degToRad(p.angle_deg as number);
    const h = (p.stack_mm as number) / 1000;
    return [
      { kind: "polyline", points: [[0, 0, 0], [0, h, 0]] },
      { kind: "polyline", points: [[0, h / 2, 0], [L * Math.cos(a), h / 2 + L * Math.sin(a), 0]] },
    ];
  },
  build(p) {
    const L = (p.length_mm as number) / 1000;
    const a = THREE.MathUtils.degToRad(p.angle_deg as number);
    const h = (p.stack_mm as number) / 1000;
    const rs = (p.steerer_clamp_mm as number) / 2000 + 0.004;
    const rb = (p.bar_clamp_mm as number) / 2000 + 0.004;
    const clamp = new THREE.CylinderGeometry(rs, rs, h, 20).translate(0, h / 2, 0);
    const end = new THREE.Vector3(L * Math.cos(a), h / 2 + L * Math.sin(a), 0);
    const body = tube(new THREE.Vector3(0, h / 2, 0), end, 0.016, 0.014, 14);
    const barClamp = new THREE.CylinderGeometry(rb, rb, 0.045, 20).rotateX(Math.PI / 2).translate(end.x, end.y, end.z);
    return [{ role: "metal", name: "stem", geometry: strip(mergeGeometries([clamp, body, barClamp].map(strip))!) }];
  },
};

/**
 * Handlebar. Families (shape class, from the binding): "drop" — required width, reach and
 * drop; "flat" — required width (rise/backsweep shown as recorded, or 0 and listed).
 * Origin and mount at the clamp centre; levers/grips anchors on both sides.
 */
export const handlebar: GeneratorDef = {
  id: "handlebar",
  version: 1,
  required: ["width_mm"],
  resolve(dims, { variant = "drop" }) {
    const assumptions: string[] = [];
    const width = num(dims, "width_mm", "bar_width_mm");
    const missing: string[] = [];
    if (width === null) missing.push("width_mm");
    let params: Record<string, number>;
    if (variant === "flat") {
      const rise = num(dims, "rise_mm") ?? (assume(assumptions, "Rise not recorded — 0 mm shown"), 0);
      const sweep = num(dims, "backsweep_deg") ?? (assume(assumptions, "Backsweep not recorded — 0° shown"), 0);
      params = { width_mm: width ?? 0, rise_mm: rise, backsweep_deg: sweep, flat: 1 };
    } else {
      const reach = num(dims, "reach_mm");
      const drop = num(dims, "drop_mm");
      if (reach === null) missing.push("reach_mm");
      if (drop === null) missing.push("drop_mm");
      const flare = num(dims, "flare_deg") ?? (assume(assumptions, "Flare not recorded — 0° shown"), 0);
      params = { width_mm: width ?? 0, reach_mm: reach ?? 0, drop_mm: drop ?? 0, flare_deg: flare, flat: 0 };
    }
    const clampRecorded = num(dims, "clamp_mm", "bar_clamp_mm");
    const clamp = clampRecorded ?? (assume(assumptions, "Clamp diameter not recorded — 31.8 mm shown"), 31.8);
    params.clamp_mm = clamp;
    const half = (params.width_mm as number) / 2000;
    const leverX = params.flat ? -Math.sin(THREE.MathUtils.degToRad(params.backsweep_deg)) * half * 0.6 : params.reach_mm / 1000;
    const leverY = params.flat ? params.rise_mm / 1000 : 0;
    return {
      ok: missing.length === 0,
      missing,
      params,
      assumptions,
      mounts: { clamp: { node: "MNT__clamp", type: "clamp", pose: interfaceFrame("clamp", [0, 0, 0], [0, 0, 1]), standard: clampRecorded === null ? undefined : String(clamp) } },
      anchors: {
        lever_r: { node: "ANC__lever_r", type: "clamp", pose: interfaceFrame("clamp", [leverX, leverY, half - 0.02], [0, 0, 1]) },
        lever_l: { node: "ANC__lever_l", type: "clamp", pose: interfaceFrame("clamp", [leverX, leverY, -(half - 0.02)], [0, 0, 1]) },
      },
    };
  },
  profile2d(p) {
    return p.flat ? [{ kind: "circle", center: [0, 0, 0], r: 0.0115 }] : [{ kind: "polyline", points: barCenterline(p, 1).map((v) => [v.x, v.y, v.z] as [number, number, number]) }];
  },
  build(p) {
    const r = 0.0115;
    const pieces: THREE.BufferGeometry[] = [];
    const clamp = new THREE.CylinderGeometry((p.clamp_mm as number) / 2000, (p.clamp_mm as number) / 2000, 0.09, 16).rotateX(Math.PI / 2);
    pieces.push(clamp);
    for (const side of [1, -1] as const) {
      pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barCenterline(p, side), false, "centripetal"), 40, r, 8, false));
    }
    return [{ role: "metal", name: "bar", geometry: strip(mergeGeometries(pieces.map(strip))!) }];
  },
};

/** Handlebar centreline for one side (shared by the 3D build and the 2D profile). */
export function barCenterline(p: Record<string, number | number[]>, side: 1 | -1): THREE.Vector3[] {
  const half = (p.width_mm as number) / 2000;
  if (p.flat) {
    const sweep = THREE.MathUtils.degToRad(p.backsweep_deg as number);
    const rise = (p.rise_mm as number) / 1000;
    return [
      new THREE.Vector3(0, 0, 0.03 * side),
      new THREE.Vector3(0, rise * 0.6, 0.1 * side),
      new THREE.Vector3(-Math.sin(sweep) * half * 0.4, rise, half * 0.7 * side),
      new THREE.Vector3(-Math.sin(sweep) * half, rise, half * side),
    ];
  }
  const reach = (p.reach_mm as number) / 1000;
  const drop = (p.drop_mm as number) / 1000;
  const flare = Math.tan(THREE.MathUtils.degToRad(p.flare_deg as number)) * drop;
  const top = half - 0.04;
  return [
    new THREE.Vector3(0, 0, 0.03 * side),
    new THREE.Vector3(0, 0, top * 0.8 * side),
    new THREE.Vector3(reach * 0.55, 0, top * side),
    new THREE.Vector3(reach, -drop * 0.25, (top + flare * 0.2) * side),
    new THREE.Vector3(reach * 0.75, -drop * 0.75, (top + flare * 0.7) * side),
    new THREE.Vector3(reach * 0.25, -drop, (top + flare) * side),
    new THREE.Vector3(-0.03, -drop, (top + flare) * side),
  ];
}

/**
 * Seatpost. Required: length and diameter. Setback from data, else 0 (listed). Insertion
 * depth comes from fit data (P3); until then a display value is used and listed.
 */
export const seatpost: GeneratorDef = {
  id: "seatpost",
  version: 1,
  required: ["length_mm", "diameter_mm"],
  resolve(dims) {
    const assumptions: string[] = [];
    const length = num(dims, "length_mm");
    const diameter = num(dims, "diameter_mm");
    const missing = [length === null && "length_mm", diameter === null && "diameter_mm"].filter(Boolean) as string[];
    const setback = num(dims, "setback_mm") ?? (assume(assumptions, "Setback not recorded — 0 mm shown"), 0);
    const params = { length_mm: length ?? 0, diameter_mm: diameter ?? 0, setback_mm: setback };
    return {
      ok: missing.length === 0,
      missing,
      params,
      assumptions,
      mounts: { insertion: { node: "MNT__insertion", type: "tube", pose: interfaceFrame("tube", [0, 0, 0], [0, 1, 0]), standard: String(diameter ?? "") } },
      anchors: {
        saddle_clamp: { node: "ANC__saddle_clamp", type: "clamp", pose: frameFromAxis([-(setback / 1000), (length ?? 0) / 1000 + 0.012, 0], [1, 0, 0], [0, 1, 0]) },
      },
    };
  },
  profile2d(p) {
    const L = (p.length_mm as number) / 1000;
    const sb = (p.setback_mm as number) / 1000;
    return [{ kind: "polyline", points: [[0, 0, 0], [0, L, 0], [-sb, L + 0.012, 0]] }];
  },
  build(p) {
    const L = (p.length_mm as number) / 1000;
    const r = (p.diameter_mm as number) / 2000;
    const sb = (p.setback_mm as number) / 1000;
    const shaft = new THREE.CylinderGeometry(r, r, L, 20).translate(0, L / 2, 0);
    const head = tube(new THREE.Vector3(0, L - 0.005, 0), new THREE.Vector3(-sb, L + 0.012, 0), r * 0.9, 0.012, 12);
    const cradle = new THREE.BoxGeometry(0.05, 0.012, 0.03).translate(-sb, L + 0.012, 0);
    return [{ role: "carbon", name: "seatpost", geometry: strip(mergeGeometries([shaft, head, cradle].map(strip))!) }];
  },
};
