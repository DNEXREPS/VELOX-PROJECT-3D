import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BIKE_SLOTS } from "@/lib/domain/slots";
import { BICYCLE_CATEGORIES, MAINTENANCE_TYPES, REPORT_REASONS } from "@/lib/domain/bicycle";
import { catalogFileSchema } from "@/lib/validation/catalog";
import { RULES, ATTRIBUTES } from "@/lib/compatibility";

const sql = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");

function enumValues(source: string, name: string): string[] {
  const m = source.match(new RegExp(`create type public\\.${name} as enum \\(([^;]+)\\);`));
  if (!m) throw new Error(`enum ${name} not found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("TypeScript ↔ SQL enum sync", () => {
  const foundation = sql("20261118000100_foundation.sql");
  it("bike_slot", () => expect(enumValues(foundation, "bike_slot")).toEqual([...BIKE_SLOTS]));
  it("bicycle_category", () => expect(enumValues(foundation, "bicycle_category")).toEqual([...BICYCLE_CATEGORIES]));
  it("maintenance_type", () => expect(enumValues(sql("20261118000600_maintenance.sql"), "maintenance_type")).toEqual([...MAINTENANCE_TYPES]));
  it("report_reason", () => expect(enumValues(sql("20261118000500_community.sql"), "report_reason")).toEqual([...REPORT_REASONS]));
});

describe("demo catalogue", () => {
  const data = catalogFileSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "supabase/catalog/demo-catalog.json"), "utf8")));

  it("is entirely labelled as demo data", () => {
    expect(data.brands.every((b) => b.is_demo)).toBe(true);
    expect(data.components.every((c) => c.slug.startsWith("demo-") && !c.verification_status)).toBe(true);
  });

  it("only uses attributes known to the compatibility engine", () => {
    const used = new Set(data.components.flatMap((c) => Object.keys(c.compatibility)));
    for (const attr of used) expect(Object.keys(ATTRIBUTES), attr).toContain(attr);
  });

  it("every rule references registered attributes", () => {
    for (const r of RULES) {
      expect(ATTRIBUTES[r.a.attribute], r.id).toBeDefined();
      expect(ATTRIBUTES[r.b.attribute], r.id).toBeDefined();
    }
  });
});
