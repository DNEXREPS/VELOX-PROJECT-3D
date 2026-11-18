import { describe, expect, it } from "vitest";
import { mapCatalogComponent, mapInstalledPart, mapSpecs, toNumber, type ComponentJoin } from "@/server/mappers";

const component: ComponentJoin = {
  id: "c1",
  slug: "demo-x",
  name: "Demo X",
  model: "X1",
  material: null,
  weight_g: "345.0",
  price_reference: "110.00",
  currency: "EUR",
  verification_status: "demo",
  brand: { name: "VELOX Demo Parts", slug: "velox-demo-parts" },
  category: { slug: "cassettes", name: "Cassettes", slots: ["cassette", "not_a_slot"] },
  specs: [
    { spec_key: "speeds", label: "Speeds", value_text: null, value_numeric: "12", unit: null, source: "demo", sort_order: 1 },
    { spec_key: "cogs", label: "Cogs", value_text: "11,12", value_numeric: null, unit: "T", source: "demo", sort_order: 0 },
  ],
  compat: [{ attribute: "speeds", value_text: null, value_list: null, value_numeric: "12" }],
};

describe("row mappers", () => {
  it("converts Postgres numerics (strings) to numbers and keeps unknowns null", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(null)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });

  it("orders specs and types numeric values", () => {
    expect(mapSpecs(component.specs).map((s) => [s.key, s.value])).toEqual([["cogs", "11,12"], ["speeds", 12]]);
  });

  it("maps catalogue components and drops unknown slots", () => {
    const c = mapCatalogComponent(component);
    expect(c).toMatchObject({ weightG: 345, priceReference: 110, slots: ["cassette"], verification: "demo", attributes: { speeds: 12 } });
  });

  it("maps installed parts, preferring the per-install currency, and custom parts", () => {
    const installed = mapInstalledPart({ id: "i1", slot: "cassette", component_id: "c1", custom_name: null, price_paid: "99", currency: "USD", installed_on: null, notes: null, component });
    expect(installed).toMatchObject({ name: "Demo X", pricePaid: 99, currency: "USD", custom: false, brand: "VELOX Demo Parts" });
    const custom = mapInstalledPart({ id: "i2", slot: "pedals", component_id: null, custom_name: "Old flats", price_paid: null, currency: null, installed_on: null, notes: null, component: null });
    expect(custom).toMatchObject({ name: "Old flats", custom: true, weightG: null, verification: null, attributes: {} });
    expect(mapInstalledPart({ id: "x", slot: "wings", component_id: null, custom_name: "x", price_paid: null, currency: null, installed_on: null, notes: null, component: null })).toBeNull();
  });
});
