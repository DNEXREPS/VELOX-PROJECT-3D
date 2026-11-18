import type { CatalogFile } from "../src/lib/validation/catalog";
import { catalogCategorySchema } from "../src/lib/validation/catalog";
import { z } from "zod";

/** SQL literal helpers — the generated SQL is reviewed into version control. */
export function lit(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function arrayLit(values: string[]): string {
  return `array[${values.map(lit).join(", ")}]::text[]`;
}

export function categoriesSql(categories: z.infer<typeof catalogCategorySchema>[]): string {
  const rows = categories.map(
    (c, i) =>
      `  (${lit(c.slug)}, ${lit(c.name)}, ${lit(c.description ?? null)}, array[${c.slots.map(lit).join(", ")}]::public.bike_slot[], ${i * 10})`,
  );
  return `insert into public.component_categories (slug, name, description, slots, sort_order) values\n${rows.join(",\n")}\non conflict (slug) do update set name = excluded.name, description = excluded.description, slots = excluded.slots, sort_order = excluded.sort_order;\n`;
}

export function catalogSql(file: CatalogFile, opts: { defaultVerification: string; specSource: string }): string {
  const out: string[] = [];
  for (const b of file.brands) {
    out.push(
      `insert into public.component_brands (slug, name, website_url, country, is_demo) values (${lit(b.slug)}, ${lit(b.name)}, ${lit(b.website_url)}, ${lit(b.country)}, ${b.is_demo}) on conflict (slug) do update set name = excluded.name;`,
    );
  }
  for (const c of file.components) {
    const status = c.verification_status ?? opts.defaultVerification;
    out.push(`
insert into public.components (slug, brand_id, category_id, name, model, description, weight_g, material, price_reference, currency, manufacturer_ref, source_url, verification_status)
select ${lit(c.slug)}, b.id, cat.id, ${lit(c.name)}, ${lit(c.model)}, ${lit(c.description)}, ${lit(c.weight_g)}, ${lit(c.material)}, ${lit(c.price_reference)}, ${lit(c.currency)}, ${lit(c.manufacturer_ref)}, ${lit(c.source_url)}, ${lit(status)}::public.component_verification
from public.component_brands b, public.component_categories cat
where b.slug = ${lit(c.brand)} and cat.slug = ${lit(c.category)}
on conflict (slug) do update set name = excluded.name, model = excluded.model, description = excluded.description, weight_g = excluded.weight_g,
  material = excluded.material, price_reference = excluded.price_reference, currency = excluded.currency,
  manufacturer_ref = excluded.manufacturer_ref, source_url = excluded.source_url, verification_status = excluded.verification_status;`);
    c.specs.forEach(([key, label, value, unit], i) => {
      const numeric = typeof value === "number" ? value : null;
      const text = typeof value === "string" ? value : null;
      out.push(
        `insert into public.component_specifications (component_id, spec_key, label, value_text, value_numeric, unit, source, sort_order) select id, ${lit(key)}, ${lit(label)}, ${lit(text)}, ${lit(numeric)}, ${lit(unit ?? null)}, ${lit(opts.specSource)}::public.data_source, ${i} from public.components where slug = ${lit(c.slug)} on conflict (component_id, spec_key) do update set label = excluded.label, value_text = excluded.value_text, value_numeric = excluded.value_numeric, unit = excluded.unit;`,
      );
    });
    for (const [attr, value] of Object.entries(c.compatibility)) {
      const text = typeof value === "string" ? lit(value) : "null";
      const list = Array.isArray(value) ? arrayLit(value) : "null";
      const num = typeof value === "number" ? lit(value) : "null";
      out.push(
        `insert into public.component_compatibility_rules (component_id, attribute, value_text, value_list, value_numeric, source) select id, ${lit(attr)}, ${text}, ${list}, ${num}, ${lit(opts.specSource)}::public.data_source from public.components where slug = ${lit(c.slug)} on conflict (component_id, attribute) do update set value_text = excluded.value_text, value_list = excluded.value_list, value_numeric = excluded.value_numeric;`,
      );
    }
  }
  return out.join("\n") + "\n";
}
