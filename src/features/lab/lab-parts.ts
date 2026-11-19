/**
 * Lab part catalogue: the REAL demo catalogue (supabase/catalog/demo-catalog.json, same data
 * as the seeded registry), with the same temporary 3D links as the studio. Since the MTB demo
 * expansion the hardtail preset uses catalogue parts too; there are no lab-only parts.
 */
import demo from "../../../supabase/catalog/demo-catalog.json";
import type { BikeSlot } from "@/lib/domain/slots";
import type { SpecValue } from "@/types/domain";
import type { AttributeMap } from "@/lib/compatibility/attributes";
import type { PartLike } from "@/features/studio/assembly/demo-bindings";

export interface LabPart {
  key: string;
  slot: BikeSlot;
  part: PartLike;
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

export const LAB_PARTS: Record<string, LabPart> = Object.fromEntries(parts.map((p) => [p.key, p]));
export const labPartsFor = (slot: BikeSlot) => parts.filter((p) => p.slot === slot);
