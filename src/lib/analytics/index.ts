import { SLOT_META, type BikeSlot, type SlotGroup } from "@/lib/domain/slots";
import type { InstalledPart } from "@/types/domain";

/**
 * Build analytics. Every figure carries its provenance and coverage so the UI can
 * distinguish user-entered, calculated, estimated and verified data — and show
 * "Unavailable" instead of a misleading number when inputs are missing.
 */

export type Provenance = "user" | "calculated" | "estimated" | "manufacturer" | "demo";

export interface Aggregate {
  /** null when NO input value is known. */
  value: number | null;
  known: number;
  total: number;
  complete: boolean;
  provenance: Provenance;
}

/** Slots that do not represent a physical part (avoid double counting). */
const NON_PHYSICAL: BikeSlot[] = ["groupset"];

export function physicalParts(parts: InstalledPart[]): InstalledPart[] {
  return parts.filter((p) => !NON_PHYSICAL.includes(p.slot));
}

export function componentWeight(parts: InstalledPart[]): Aggregate {
  const physical = physicalParts(parts);
  const known = physical.filter((p) => p.weightG !== null);
  const value = known.length ? known.reduce((s, p) => s + (p.weightG ?? 0), 0) : null;
  return { value, known: known.length, total: physical.length, complete: physical.length > 0 && known.length === physical.length, provenance: "calculated" };
}

export interface CostBreakdown {
  /** Sum of user-entered prices paid, per currency. */
  paid: Record<string, number>;
  /** Sum of catalogue reference prices for parts without a price paid, per currency. */
  reference: Record<string, number>;
  pricedParts: number;
  totalParts: number;
  /** True when parts span more than one currency (no FX conversion is performed). */
  mixedCurrency: boolean;
}

export function componentCost(parts: InstalledPart[]): CostBreakdown {
  const physical = physicalParts(parts);
  const paid: Record<string, number> = {};
  const reference: Record<string, number> = {};
  let priced = 0;
  for (const p of physical) {
    if (p.pricePaid !== null && p.currency) {
      paid[p.currency] = (paid[p.currency] ?? 0) + p.pricePaid;
      priced++;
    } else if (p.priceReference !== null && p.currency) {
      reference[p.currency] = (reference[p.currency] ?? 0) + p.priceReference;
      priced++;
    }
  }
  const currencies = new Set([...Object.keys(paid), ...Object.keys(reference)]);
  return { paid, reference, pricedParts: priced, totalParts: physical.length, mixedCurrency: currencies.size > 1 };
}

/** Parse tooth counts from a spec value such as "50,34" or "11-12-13" or "11, 12". */
export function parseTeeth(value: string | number | null | undefined): number[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "number") return Number.isInteger(value) && value > 4 && value < 100 ? [value] : [];
  const nums = value
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 4 && n < 100);
  return nums;
}

function specValue(part: InstalledPart | undefined, keys: string[]) {
  if (!part) return undefined;
  for (const k of keys) {
    const s = part.specs.find((x) => x.key === k);
    if (s) return s.value;
  }
  return undefined;
}

export interface Drivetrain {
  chainrings: number[];
  cogs: number[];
  speeds: number | null;
  /** e.g. "2×12". null when unavailable. */
  label: string | null;
  source: { chainrings: InstalledPart["verification"]; cogs: InstalledPart["verification"] };
}

export function drivetrain(parts: InstalledPart[]): Drivetrain {
  const crank = parts.find((p) => p.slot === "crankset");
  const cassette = parts.find((p) => p.slot === "cassette");
  const chainrings = parseTeeth(specValue(crank, ["chainrings", "teeth"]) as string | number | undefined).sort((a, b) => b - a);
  const cogs = parseTeeth(specValue(cassette, ["cogs"]) as string | number | undefined).sort((a, b) => a - b);
  const speedsAttr = cassette?.attributes.speeds;
  const speeds = typeof speedsAttr === "number" ? speedsAttr : cogs.length > 0 ? cogs.length : null;
  const label = chainrings.length > 0 && speeds ? `${chainrings.length}×${speeds}` : null;
  return {
    chainrings,
    cogs,
    speeds,
    label,
    source: { chainrings: crank?.verification ?? null, cogs: cassette?.verification ?? null },
  };
}

export const BEAD_SEAT_DIAMETER_MM: Record<string, number> = { "700c": 622, "650b": 584, "26in": 559 };

export interface WheelInfo {
  wheelSize: string | null;
  frontTireWidth: number | null;
  rearTireWidth: number | null;
  /** Estimated rolling circumference (mm) of the rear wheel: π × (BSD + 2 × width). */
  circumferenceMm: number | null;
}

export function wheelInfo(parts: InstalledPart[]): WheelInfo {
  const wheels = parts.find((p) => p.slot === "wheelset");
  const front = parts.find((p) => p.slot === "front_tire");
  const rear = parts.find((p) => p.slot === "rear_tire");
  const size = (rear?.attributes.wheel_size ?? wheels?.attributes.wheel_size) as string | undefined;
  const fw = typeof front?.attributes.tire_width_mm === "number" ? front.attributes.tire_width_mm : null;
  const rw = typeof rear?.attributes.tire_width_mm === "number" ? rear.attributes.tire_width_mm : null;
  const bsd = size ? BEAD_SEAT_DIAMETER_MM[size] : undefined;
  return {
    wheelSize: size ?? null,
    frontTireWidth: fw,
    rearTireWidth: rw,
    circumferenceMm: bsd && rw ? Math.round(Math.PI * (bsd + 2 * rw)) : null,
  };
}

export interface GearCell {
  chainring: number;
  cog: number;
  ratio: number;
  /** Metres travelled per crank revolution (estimated; needs circumference). */
  developmentM: number | null;
  /** km/h at 90 rpm (estimated). */
  speedAt90: number | null;
}

export function gearTable(chainrings: number[], cogs: number[], circumferenceMm: number | null): GearCell[] {
  const cells: GearCell[] = [];
  for (const ring of chainrings) {
    for (const cog of cogs) {
      const ratio = ring / cog;
      const dev = circumferenceMm ? (ratio * circumferenceMm) / 1000 : null;
      cells.push({
        chainring: ring,
        cog,
        ratio: Math.round(ratio * 100) / 100,
        developmentM: dev !== null ? Math.round(dev * 100) / 100 : null,
        speedAt90: dev !== null ? Math.round(((dev * 90 * 60) / 1000) * 10) / 10 : null,
      });
    }
  }
  return cells;
}

export interface GearRange {
  lowest: number;
  highest: number;
  /** highest / lowest — "range" in percent, e.g. 420 %. */
  rangePercent: number;
}

export function gearRange(cells: GearCell[]): GearRange | null {
  if (cells.length === 0) return null;
  const ratios = cells.map((c) => c.ratio);
  const lowest = Math.min(...ratios);
  const highest = Math.max(...ratios);
  return { lowest, highest, rangePercent: Math.round((highest / lowest) * 100) };
}

export interface GroupShare {
  group: SlotGroup;
  weightG: number;
  parts: number;
}

export function weightByGroup(parts: InstalledPart[]): GroupShare[] {
  const map = new Map<SlotGroup, GroupShare>();
  for (const p of physicalParts(parts)) {
    const group = SLOT_META[p.slot].group;
    const entry = map.get(group) ?? { group, weightG: 0, parts: 0 };
    entry.parts++;
    entry.weightG += p.weightG ?? 0;
    map.set(group, entry);
  }
  return [...map.values()].sort((a, b) => b.weightG - a.weightG);
}

export interface ProvenanceSummary {
  manufacturer_verified: number;
  community_verified: number;
  user_submitted: number;
  demo: number;
  custom: number;
}

export function provenanceSummary(parts: InstalledPart[]): ProvenanceSummary {
  const s: ProvenanceSummary = { manufacturer_verified: 0, community_verified: 0, user_submitted: 0, demo: 0, custom: 0 };
  for (const p of parts) {
    if (p.custom || !p.verification) s.custom++;
    else s[p.verification]++;
  }
  return s;
}
