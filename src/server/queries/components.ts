import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { ComponentQuery } from "@/lib/validation/schemas";
import { PAGE_SIZE, pageRange, sanitizeSearch } from "@/lib/postgrest";
import { COMPONENT_SELECT, mapCatalogComponent, mapSpecs, type ComponentJoin } from "@/server/mappers";
import { attributesFromRows } from "@/lib/compatibility/attributes";
import type { BikeSlot } from "@/lib/domain/slots";
import type { CatalogComponent, CatalogRow } from "@/types/domain";

type Client = NonNullable<ServerSupabase>;

export async function listCategories(supabase: Client) {
  const { data, error } = await supabase.from("component_categories").select("id, slug, name, description, slots").order("sort_order");
  if (error) throw error;
  return data;
}

export async function listBrands(supabase: Client) {
  const { data, error } = await supabase.from("component_brands").select("id, slug, name, is_demo").order("name");
  if (error) throw error;
  return data;
}

export interface ComponentPage {
  items: CatalogRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function searchComponents(supabase: Client, query: ComponentQuery, pageSize = PAGE_SIZE): Promise<ComponentPage> {
  let req = supabase.from("component_catalog").select("*", { count: "exact" });
  const q = sanitizeSearch(query.q);
  if (q) req = req.or(`name.ilike.%${q}%,model.ilike.%${q}%,brand_name.ilike.%${q}%,manufacturer_ref.ilike.%${q}%`);
  if (query.category) req = req.eq("category_slug", query.category);
  if (query.brand) req = req.eq("brand_slug", query.brand);
  if (query.slot) req = req.contains("category_slots", [query.slot]);
  switch (query.sort) {
    case "weight_asc":
      req = req.order("weight_g", { ascending: true, nullsFirst: false });
      break;
    case "weight_desc":
      req = req.order("weight_g", { ascending: false, nullsFirst: false });
      break;
    case "price_asc":
      req = req.order("price_reference", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      req = req.order("price_reference", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      req = req.order("created_at", { ascending: false });
      break;
    default:
      req = req.order("name");
  }
  const [from, to] = pageRange(query.page, pageSize);
  const { data, count, error } = await req.order("id").range(from, to);
  if (error) throw error;
  const total = count ?? 0;
  return { items: data ?? [], total, page: query.page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getComponentBySlug(supabase: Client, slug: string) {
  const { data, error } = await supabase
    .from("components")
    .select(
      "*, brand:component_brands(id, name, slug, website_url, is_demo), category:component_categories(slug, name, slots), specs:component_specifications(spec_key, label, value_text, value_numeric, unit, source, sort_order), compat:component_compatibility_rules(attribute, value_text, value_list, value_numeric, notes, source), images:component_images(url, alt, sort_order)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    specValues: mapSpecs(data.specs),
    attributes: attributesFromRows(data.compat ?? []),
  };
}

/** Components that may occupy `slot`, with specs + compatibility attributes (studio picker). */
export async function listSlotCandidates(supabase: Client, slot: BikeSlot, search?: string, limit = 60): Promise<CatalogComponent[]> {
  const { data: cats } = await supabase.from("component_categories").select("id").contains("slots", [slot]);
  const catIds = (cats ?? []).map((c) => c.id);
  if (catIds.length === 0) return [];
  let req = supabase.from("components").select(COMPONENT_SELECT).in("category_id", catIds);
  const q = sanitizeSearch(search);
  if (q) req = req.or(`name.ilike.%${q}%,model.ilike.%${q}%`);
  const { data, error } = await req.order("name").limit(limit);
  if (error) throw error;
  return (data as unknown as ComponentJoin[]).map(mapCatalogComponent);
}

/** Bicycles (owned by the user) that have this component installed — for the detail page. */
export async function countInstallations(supabase: Client, componentId: string): Promise<number> {
  const { count } = await supabase.from("passport_components").select("id", { count: "exact", head: true }).eq("component_id", componentId);
  return count ?? 0;
}
