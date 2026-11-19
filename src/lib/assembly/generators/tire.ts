import { IDENTITY } from "../math";
import { assume, lathe, num, strip, type GeneratorDef } from "./common";

/** Casing height model used when the outer diameter is not recorded. */
export const TIRE_HEIGHT_RATIO = 0.94;

/** Tire on the rim bead. Required: width and bead seat diameter (both from the TIRE's own data). */
export const tire: GeneratorDef = {
  id: "tire",
  version: 1,
  required: ["width_mm", "bsd_mm"],
  resolve(dims) {
    const assumptions: string[] = [];
    const width = num(dims, "width_mm");
    const bsd = num(dims, "bsd_mm");
    const missing = [width === null && "width_mm", bsd === null && "bsd_mm"].filter(Boolean) as string[];
    const outer = num(dims, "outer_diameter_mm");
    let height = 0;
    if (outer !== null && bsd !== null && outer > bsd) height = (outer - bsd) / 2;
    else if (width !== null) {
      height = width * TIRE_HEIGHT_RATIO;
      assume(assumptions, `Outer diameter not recorded — casing height modelled as ${TIRE_HEIGHT_RATIO} × width (VELOX model, not a manufacturer value)`);
    }
    assume(assumptions, "Tread pattern not modelled (smooth casing, cosmetic)");
    const params = { width_mm: width ?? 0, bsd_mm: bsd ?? 0, height_mm: Math.round(height * 10) / 10 };
    return {
      ok: missing.length === 0,
      missing,
      params,
      assumptions,
      mounts: { bead: { node: "MNT__bead", type: "bead", pose: { ...IDENTITY }, standard: `bsd_${params.bsd_mm}` } },
      anchors: {},
      outerRadiusM: ((bsd ?? 0) / 2 + height) / 1000,
    };
  },
  profile2d(p) {
    return [{ kind: "circle", center: [0, 0, 0], r: (p.bsd_mm as number) / 2000 + (p.height_mm as number) / 1000 }];
  },
  build(p) {
    const R = (p.bsd_mm as number) / 2000;
    const h = (p.height_mm as number) / 1000;
    const w = (p.width_mm as number) / 1000;
    const profile: [number, number][] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = -Math.PI / 2 + (i / steps) * Math.PI;
      const s = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 0.8);
      const c = Math.pow(Math.abs(Math.cos(t)), 0.7);
      profile.push([R + h * c, (w / 2) * s]);
    }
    return [{ role: "rubber", name: "casing", geometry: strip(lathe(profile, 96)) }];
  },
};
