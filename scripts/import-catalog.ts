/**
 * Import a catalogue JSON file (same schema as supabase/catalog/demo-catalog.json)
 * into a Supabase project, using the SERVICE ROLE key (server-side only).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run catalog:import -- path/to/file.json
 *
 * Rules enforced:
 *  - entries default to verification_status 'user_submitted' unless specified;
 *  - 'manufacturer_verified' requires source_url (schema + DB constraint);
 *  - specs/compat attributes are written with source 'manufacturer' only for
 *    manufacturer_verified entries, otherwise 'community'.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { catalogFileSchema } from "../src/lib/validation/catalog";

async function main() {
  const file = process.argv[2];
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!file || !url || !key) {
    console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run catalog:import -- <file.json>");
    process.exit(1);
  }
  const data = catalogFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const brand of data.brands) {
    const { error } = await db.from("component_brands").upsert(brand, { onConflict: "slug" });
    if (error) throw error;
  }
  const [{ data: brands, error: be }, { data: cats, error: ce }] = await Promise.all([
    db.from("component_brands").select("id, slug"),
    db.from("component_categories").select("id, slug"),
  ]);
  if (be || ce) throw be ?? ce;
  const brandId = new Map(brands!.map((b) => [b.slug, b.id]));
  const catId = new Map(cats!.map((c) => [c.slug, c.id]));

  for (const c of data.components) {
    const status = c.verification_status ?? "user_submitted";
    const source = status === "manufacturer_verified" ? "manufacturer" : status === "demo" ? "demo" : "community";
    if (!brandId.has(c.brand)) throw new Error(`Unknown brand ${c.brand} (${c.slug})`);
    if (!catId.has(c.category)) throw new Error(`Unknown category ${c.category} (${c.slug})`);
    const { data: row, error } = await db
      .from("components")
      .upsert(
        {
          slug: c.slug, brand_id: brandId.get(c.brand), category_id: catId.get(c.category), name: c.name,
          model: c.model ?? null, description: c.description ?? null, weight_g: c.weight_g ?? null,
          material: c.material ?? null, price_reference: c.price_reference ?? null, currency: c.currency ?? null,
          manufacturer_ref: c.manufacturer_ref ?? null, source_url: c.source_url ?? null, verification_status: status,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const specs = c.specs.map(([spec_key, label, value, unit], i) => ({
      component_id: row.id, spec_key, label, sort_order: i, source,
      value_text: typeof value === "string" ? value : null,
      value_numeric: typeof value === "number" ? value : null,
      unit: unit ?? null,
    }));
    if (specs.length) {
      const { error: se } = await db.from("component_specifications").upsert(specs, { onConflict: "component_id,spec_key" });
      if (se) throw se;
    }
    const attrs = Object.entries(c.compatibility).map(([attribute, v]) => ({
      component_id: row.id, attribute, source,
      value_text: typeof v === "string" ? v : null,
      value_list: Array.isArray(v) ? v : null,
      value_numeric: typeof v === "number" ? v : null,
    }));
    if (attrs.length) {
      const { error: ae } = await db.from("component_compatibility_rules").upsert(attrs, { onConflict: "component_id,attribute" });
      if (ae) throw ae;
    }
    console.log(`✓ ${c.slug} (${status})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
