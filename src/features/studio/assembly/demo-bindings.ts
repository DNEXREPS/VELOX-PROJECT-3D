/**
 * TEMPORARY P1 visual links between demo catalog components and 3D representations.
 * Replaced in P3 by the `component_visuals` table (no database change in P1).
 *
 * Rules:
 *  - Links are explicit per catalog slug. A component without a link has NO 3D
 *    representation — it never borrows geometry from another component.
 *  - Generators only receive dimensions RECORDED on the component (specs/attributes);
 *    missing required dimensions produce an explicit "unavailable" state.
 *  - An authored asset is marked matchesRecordedGeometry only when it was built to the
 *    component's recorded dimensions (pipeline-verified). Otherwise measurements derived
 *    from it are estimates.
 */
import type { BikeSlot } from "@/lib/domain/slots";
import { GENERATOR_VERSIONS } from "@/lib/assembly/generators";
import type { PartInput, VisualBinding } from "@/lib/assembly/spec";
import type { AttributeMap } from "@/lib/compatibility/attributes";
import type { SpecValue } from "@/types/domain";

const gen = (generator: Extract<VisualBinding, { kind: "generator" }>["generator"], variant?: string): VisualBinding => ({ kind: "generator", generator, version: GENERATOR_VERSIONS[generator], variant });
const asset = (key: string, matchesRecordedGeometry: boolean): VisualBinding => ({ kind: "asset", key, version: 1, matchesRecordedGeometry });

export const DEMO_VISUAL_LINKS: Record<string, VisualBinding> = {
  // Frames: no demo frame has a recorded geometry chart → representative shape only.
  "demo-endurance-carbon-disc-frame": asset("frame-road-demo", false),
  // Forks: built to the recorded axle-to-crown (370) and offset (47).
  "demo-carbon-disc-fork": asset("fork-demo-carbon-disc", true),
  // Wheels, tires, cockpit, seat, drivetrain, rotors: generated from recorded dimensions.
  "demo-alloy-disc-wheelset": gen("wheel"),
  "demo-carbon-45-disc-wheelset": gen("wheel"),
  "demo-alloy-rim-brake-wheelset": gen("wheel"),
  "demo-road-tire-700x28": gen("tire"),
  "demo-road-tire-700x32": gen("tire"),
  "demo-gravel-tire-700x40": gen("tire"),
  "demo-gravel-tire-650bx47": gen("tire"),
  "demo-alloy-stem-100": gen("stem"),
  "demo-alloy-stem-90-35": gen("stem"),
  "demo-alloy-drop-bar-420": gen("handlebar", "drop"),
  "demo-carbon-drop-bar-400": gen("handlebar", "drop"),
  "demo-flared-gravel-bar-440": gen("handlebar", "drop"),
  "demo-carbon-seatpost-27-2": gen("seatpost"),
  "demo-alloy-seatpost-31-6": gen("seatpost"),
  "demo-r12-crankset-50-34": gen("crankset"),
  "demo-g12-crankset-40": gen("crankset"),
  "demo-r11-crankset-52-36": gen("crankset"),
  "demo-r12-cassette-11-34": gen("cassette"),
  "demo-r12-cassette-10-33-xdr": gen("cassette"),
  "demo-g12-cassette-10-44-xdr": gen("cassette"),
  "demo-r11-cassette-11-28": gen("cassette"),
  "demo-r12-chain": gen("chain"),
  "demo-r11-chain": gen("chain"),
  "demo-rotor-160-centerlock": gen("rotor"),
  "demo-rotor-140-centerlock": gen("rotor"),
  "demo-rotor-180-6bolt": gen("rotor"),

  // ---- MTB hardtail demo (P1) ----
  // Frame: representative hardtail model; this frame has no recorded geometry chart.
  "demo-trail-hardtail-alloy-frame": asset("frame-hardtail-demo", false),
  // Forks: models built to each fork's recorded axle-to-crown and offset.
  "demo-rigid-mtb-fork-470": asset("fork-mtb-rigid-demo", true),
  "demo-rigid-mtb-fork-480": asset("fork-demo-mtb-480", true),
  // "demo-rigid-mtb-fork-unspecified" is deliberately unlinked: no recorded geometry → no 3D model.
  "demo-29-trail-wheelset": gen("wheel"),
  "demo-mtb-tire-29x2-4": gen("tire"),
  "demo-mtb-tire-29x2-2": gen("tire"),
  "demo-alloy-flat-bar-780": gen("handlebar", "flat"),
  "demo-carbon-flat-bar-760": gen("handlebar", "flat"),
  "demo-alloy-riser-bar-unspecified": gen("handlebar", "flat"),
  "demo-alloy-mtb-stem-50": gen("stem"),
  "demo-alloy-mtb-stem-70": gen("stem"),
  "demo-m12-crankset-170-32": gen("crankset"),
  "demo-m12-crankset-175-30": gen("crankset"),
  "demo-m12-cassette-10-51-ms": gen("cassette"),
  "demo-x12-cassette-10-52-xd": gen("cassette"),
  "demo-m12-chain": gen("chain"),
  "demo-rotor-203-6bolt": gen("rotor"),
};

export interface PartLike {
  componentSlug: string | null;
  name: string;
  specs: SpecValue[];
  attributes: AttributeMap;
}

const specNum = (specs: SpecValue[], key: string): number | undefined => {
  const s = specs.find((x) => x.key === key);
  if (!s) return undefined;
  const n = typeof s.value === "number" ? s.value : Number(String(s.value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
const specText = (specs: SpecValue[], key: string): string | undefined => {
  const s = specs.find((x) => x.key === key);
  return s === undefined ? undefined : String(s.value);
};

/** ETRTO "28-622" → { width, bsd }. */
export function parseEtrto(value: string | undefined): { width?: number; bsd?: number } {
  const m = value ? /^\s*(\d{2,3})\s*-\s*(\d{3})\s*$/.exec(value) : null;
  return m ? { width: Number(m[1]), bsd: Number(m[2]) } : {};
}

/** Recorded dimensions for a generator, read from the component's specs and attributes only. */
export function recordedDims(generator: string, part: PartLike): Record<string, unknown> {
  const { specs, attributes: a } = part;
  switch (generator) {
    case "wheel":
      return { wheel_size: a.wheel_size, rim_depth_mm: specNum(specs, "rim_depth"), rim_width_mm: specNum(specs, "internal_width"), rim_width_is_internal: specNum(specs, "internal_width") !== undefined, front_axle: a.front_axle, rear_axle: a.rear_axle, brake_type: a.brake_type };
    case "tire": {
      const e = parseEtrto(specText(specs, "etrto"));
      return { width_mm: e.width ?? a.tire_width_mm, bsd_mm: e.bsd, wheel_size: a.wheel_size };
    }
    case "stem":
      return { length_mm: specNum(specs, "length"), angle_deg: specNum(specs, "angle"), steerer_clamp_mm: a.steerer_clamp_mm, bar_clamp_mm: a.handlebar_clamp_mm };
    case "handlebar":
      return { width_mm: specNum(specs, "width"), reach_mm: specNum(specs, "reach"), drop_mm: specNum(specs, "drop"), flare_deg: specNum(specs, "flare"), rise_mm: specNum(specs, "rise"), backsweep_deg: specNum(specs, "backsweep"), clamp_mm: a.clamp_mm };
    case "seatpost":
      return { length_mm: specNum(specs, "length"), diameter_mm: a.seatpost_diameter_mm, setback_mm: specNum(specs, "setback") };
    case "crankset":
      return { crank_length_mm: specNum(specs, "crank_length"), chainrings: specText(specs, "chainrings") };
    case "cassette":
      return { cogs: specText(specs, "cogs") };
    case "chain":
      return { speeds: specNum(specs, "speeds") ?? a.speeds };
    case "rotor":
      return { diameter_mm: a.rotor_diameter_mm };
    default:
      return {};
  }
}

/** Build the resolver input for one slot. Custom parts and unlinked components have no visual. */
export function toPartInput(slot: BikeSlot, part: PartLike | null, custom = false): PartInput | undefined {
  if (!part) return undefined;
  const link = !custom && part.componentSlug ? DEMO_VISUAL_LINKS[part.componentSlug] : undefined;
  if (!link) return { slot, name: part.name, visual: null, dims: {} };
  if (link.kind === "asset") return { slot, name: part.name, visual: link, dims: {} };
  return { slot, name: part.name, visual: link, dims: recordedDims(link.generator, part) as PartInput["dims"] };
}

/** bicycles.category → engine target supported in P1 (road, hardtail). null = not supported yet. */
export function engineTarget(category: string | null | undefined): "road" | "mtb_hardtail" | null {
  if (category === "road") return "road";
  if (category === "mountain") return "mtb_hardtail";
  return null;
}
