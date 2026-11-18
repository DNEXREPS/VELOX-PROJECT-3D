import { attributesFromRows } from "@/lib/compatibility/attributes";
import { isBikeSlot, type BikeSlot } from "@/lib/domain/slots";
import type { VerificationStatus } from "@/lib/domain/bicycle";
import type { CatalogComponent, DataProvenance, InstalledPart, SpecValue } from "@/types/domain";

/* Pure row → domain mappers (unit-tested). */

type SpecRow = {
  spec_key: string;
  label: string;
  value_text: string | null;
  value_numeric: number | string | null;
  unit: string | null;
  source: string;
  sort_order?: number | null;
};
type AttrRow = { attribute: string; value_text: string | null; value_list: string[] | null; value_numeric: number | string | null };

export function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapSpecs(rows: SpecRow[] | null | undefined): SpecValue[] {
  return [...(rows ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({
      key: r.spec_key,
      label: r.label,
      value: r.value_numeric !== null && r.value_numeric !== undefined ? Number(r.value_numeric) : (r.value_text ?? ""),
      unit: r.unit,
      source: r.source as DataProvenance,
    }));
}

export interface ComponentJoin {
  id: string;
  slug: string;
  name: string;
  model: string | null;
  material: string | null;
  weight_g: number | string | null;
  price_reference: number | string | null;
  currency: string | null;
  verification_status: string;
  brand: { name: string; slug: string } | null;
  category: { slug: string; name: string; slots: string[] } | null;
  specs?: SpecRow[] | null;
  compat?: AttrRow[] | null;
}

export function mapCatalogComponent(c: ComponentJoin): CatalogComponent {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    model: c.model,
    brandName: c.brand?.name ?? "Unknown brand",
    brandSlug: c.brand?.slug ?? "",
    categorySlug: c.category?.slug ?? "",
    categoryName: c.category?.name ?? "",
    slots: (c.category?.slots ?? []).filter(isBikeSlot),
    weightG: toNumber(c.weight_g),
    priceReference: toNumber(c.price_reference),
    currency: c.currency,
    material: c.material,
    verification: c.verification_status as VerificationStatus,
    specs: mapSpecs(c.specs),
    attributes: attributesFromRows(c.compat ?? []),
  };
}

export interface InstalledJoin {
  id: string;
  slot: string;
  component_id: string | null;
  custom_name: string | null;
  price_paid: number | string | null;
  currency: string | null;
  installed_on: string | null;
  notes: string | null;
  component: ComponentJoin | null;
}

export function mapInstalledPart(row: InstalledJoin): InstalledPart | null {
  if (!isBikeSlot(row.slot)) return null;
  const c = row.component;
  return {
    id: row.id,
    slot: row.slot as BikeSlot,
    componentId: row.component_id,
    componentSlug: c?.slug ?? null,
    name: c?.name ?? row.custom_name ?? "Unnamed part",
    brand: c?.brand?.name ?? null,
    model: c?.model ?? null,
    categorySlug: c?.category?.slug ?? null,
    categoryName: c?.category?.name ?? null,
    material: c?.material ?? null,
    weightG: toNumber(c?.weight_g),
    priceReference: toNumber(c?.price_reference),
    currency: row.currency ?? c?.currency ?? null,
    pricePaid: toNumber(row.price_paid),
    installedOn: row.installed_on,
    notes: row.notes,
    verification: (c?.verification_status as VerificationStatus) ?? null,
    custom: !c,
    specs: mapSpecs(c?.specs),
    attributes: attributesFromRows(c?.compat ?? []),
  };
}

export const COMPONENT_SELECT =
  "id, slug, name, model, material, weight_g, price_reference, currency, verification_status, brand:component_brands(name, slug), category:component_categories(slug, name, slots), specs:component_specifications(spec_key, label, value_text, value_numeric, unit, source, sort_order), compat:component_compatibility_rules(attribute, value_text, value_list, value_numeric)";
