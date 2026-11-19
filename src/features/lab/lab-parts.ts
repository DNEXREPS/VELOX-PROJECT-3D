/**
 * Lab part catalogue: the REAL demo catalogue (supabase/catalog/demo-catalog.json, same data
 * as the seeded registry) plus a few lab-only hardtail parts, because the demo catalogue has
 * no MTB components yet. Lab-only parts are fictional, clearly labelled, never seeded.
 */
import demo from "../../../supabase/catalog/demo-catalog.json";
import type { BikeSlot } from "@/lib/domain/slots";
import type { VisualBinding } from "@/lib/assembly/spec";
import type { SpecValue } from "@/types/domain";
import type { AttributeMap } from "@/lib/compatibility/attributes";
import { GENERATOR_VERSIONS } from "@/lib/assembly/generators";
import type { PartLike } from "@/features/studio/assembly/demo-bindings";

export interface LabPart {
  key: string;
  slot: BikeSlot;
  part: PartLike;
  /** Lab-only parts carry their own binding; demo parts use the studio's DEMO_VISUAL_LINKS. */
  binding?: VisualBinding;
  labOnly?: boolean;
}

const CATEGORY_SLOT: Record<string, BikeSlot> = {
  frames: "frame", forks: "fork", wheelsets: "wheelset", stems: "stem", handlebars: "handlebar", seatposts: "seatpost",
  cranksets: "crankset", cassettes: "cassette", chains: "chain",
};

type DemoComponent = { slug: string; category: string; name: string; specs?: (string | number)[][]; compatibility?: Record<string, unknown> | null };

const fromDemo = (c: DemoComponent, slot: BikeSlot): LabPart => ({
  key: c.slug,
  slot,
  part: {
    componentSlug: c.slug,
    name: c.name,
    specs: (c.specs ?? []).map((s) => ({ key: String(s[0]), label: String(s[1]), value: s[2] as string | number, unit: (s[3] as string) ?? null, source: "demo" }) as SpecValue),
    attributes: (c.compatibility ?? {}) as AttributeMap,
  },
});

const parts: LabPart[] = [];
for (const c of (demo as { components: DemoComponent[] }).components) {
  if (c.category === "tires") {
    parts.push(fromDemo(c, "front_tire"), { ...fromDemo(c, "rear_tire"), key: `${c.slug}#rear` });
  } else if (c.category === "brake-rotors") {
    parts.push(fromDemo(c, "front_rotor"), { ...fromDemo(c, "rear_rotor"), key: `${c.slug}#rear` });
  } else if (CATEGORY_SLOT[c.category]) {
    parts.push(fromDemo(c, CATEGORY_SLOT[c.category]));
  }
}

const lab = (key: string, slot: BikeSlot, name: string, specs: [string, string | number][], attributes: AttributeMap, binding: VisualBinding): LabPart => ({
  key,
  slot,
  labOnly: true,
  binding,
  part: { componentSlug: null, name: `${name} (lab-only demo)`, specs: specs.map(([key, value]) => ({ key, label: key, value, unit: null, source: "demo" })), attributes },
});
const g = (generator: Extract<VisualBinding, { kind: "generator" }>["generator"], variant?: string): VisualBinding => ({ kind: "generator", generator, version: GENERATOR_VERSIONS[generator], variant });

parts.push(
  lab("lab-hardtail-frame", "frame", 'VELOX Demo 29" hardtail frame (L)', [], {}, { kind: "asset", key: "frame-hardtail-demo", version: 1, matchesRecordedGeometry: true }),
  lab("lab-rigid-mtb-fork", "fork", 'VELOX Demo 29" rigid MTB fork', [["axle_to_crown", 470], ["offset", 44]], {}, { kind: "asset", key: "fork-mtb-rigid-demo", version: 1, matchesRecordedGeometry: true }),
  lab("lab-29-wheelset", "wheelset", "29\" trail wheelset", [["rim_depth", 22], ["internal_width", 30]], { wheel_size: "29", front_axle: "15x110_boost", rear_axle: "12x148_boost", brake_type: "disc" }, g("wheel")),
  lab("lab-29x2.4-tire", "front_tire", "29 × 2.4\" trail tire", [["etrto", "60-622"]], {}, g("tire")),
  lab("lab-29x2.4-tire#rear", "rear_tire", "29 × 2.4\" trail tire", [["etrto", "60-622"]], {}, g("tire")),
  lab("lab-flat-bar-780", "handlebar", "780 mm riser bar", [["width", 780], ["rise", 20], ["backsweep", 9]], { clamp_mm: 35 }, g("handlebar", "flat")),
  lab("lab-stem-50", "stem", "50 mm trail stem", [["length", 50], ["angle", 0]], { steerer_clamp_mm: 28.6, handlebar_clamp_mm: 35 }, g("stem")),
  lab("lab-crank-170-32", "crankset", "170 mm 1× crankset, 32T", [["crank_length", 170], ["chainrings", "32"]], {}, g("crankset")),
  lab("lab-crank-175-32", "crankset", "175 mm 1× crankset, 32T", [["crank_length", 175], ["chainrings", "32"]], {}, g("crankset")),
  lab("lab-dropper-31-6", "seatpost", "31.6 mm post (no setback recorded)", [["length", 400]], { seatpost_diameter_mm: 31.6 }, g("seatpost")),
);

export const LAB_PARTS: Record<string, LabPart> = Object.fromEntries(parts.map((p) => [p.key, p]));
export const labPartsFor = (slot: BikeSlot) => parts.filter((p) => p.slot === slot);
