import type { InstalledPart } from "@/types/domain";
import type { BikeSlot } from "@/lib/domain/slots";
import type { AttributeMap } from "@/lib/compatibility/attributes";

export function part(slot: BikeSlot, overrides: Partial<InstalledPart> & { attributes?: AttributeMap } = {}): InstalledPart {
  return {
    id: `id-${slot}`,
    slot,
    componentId: `c-${slot}`,
    componentSlug: `c-${slot}`,
    name: `Part ${slot}`,
    brand: "Demo",
    model: null,
    categorySlug: null,
    categoryName: null,
    material: null,
    weightG: null,
    priceReference: null,
    currency: null,
    pricePaid: null,
    installedOn: null,
    notes: null,
    verification: "demo",
    custom: false,
    specs: [],
    attributes: {},
    ...overrides,
  };
}
