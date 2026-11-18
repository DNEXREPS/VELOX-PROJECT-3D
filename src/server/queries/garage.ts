import "server-only";
import type { SessionContext } from "@/server/auth";
import { COMPONENT_SELECT, mapInstalledPart, toNumber, type InstalledJoin } from "@/server/mappers";
import { signBicycleMedia } from "@/server/storage";
import type { BicyclePrivateRow, BicycleRow, InstalledPart, MaintenanceRow, RevisionRow } from "@/types/domain";

type Ctx = Pick<SessionContext, "supabase" | "userId">;

export interface GarageBike extends BicycleRow {
  coverUrl: string | null;
  componentCount: number;
}

/** All of the current user's bicycles. RLS restricts rows to the owner; we filter explicitly too. */
export async function listMyBicycles(ctx: Ctx): Promise<GarageBike[]> {
  const { data, error } = await ctx.supabase
    .from("bicycles")
    .select("*, bicycle_components(count)")
    .eq("owner_id", ctx.userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const urls = await signBicycleMedia(ctx.supabase, data.map((b) => b.cover_image_path));
  return data.map(({ bicycle_components, ...b }) => ({
    ...b,
    coverUrl: b.cover_image_path ? (urls.get(b.cover_image_path) ?? null) : null,
    componentCount: (bicycle_components as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}

export interface BikeImage {
  id: string;
  storage_path: string;
  caption: string | null;
  url: string | null;
}

export interface BikeDetail {
  bike: BicycleRow;
  privateDetails: BicyclePrivateRow | null;
  coverUrl: string | null;
  images: BikeImage[];
}

export async function getMyBicycle(ctx: Ctx, bikeId: string): Promise<BikeDetail | null> {
  const { data: bike } = await ctx.supabase
    .from("bicycles")
    .select("*")
    .eq("id", bikeId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!bike) return null;
  const [{ data: priv }, { data: images }] = await Promise.all([
    ctx.supabase.from("bicycle_private_details").select("*").eq("bicycle_id", bikeId).maybeSingle(),
    ctx.supabase.from("bicycle_images").select("id, storage_path, caption").eq("bicycle_id", bikeId).order("sort_order").order("created_at"),
  ]);
  const urls = await signBicycleMedia(ctx.supabase, [bike.cover_image_path, ...(images ?? []).map((i) => i.storage_path)]);
  return {
    bike,
    privateDetails: priv ?? null,
    coverUrl: bike.cover_image_path ? (urls.get(bike.cover_image_path) ?? null) : null,
    images: (images ?? []).map((i) => ({ ...i, url: urls.get(i.storage_path) ?? null })),
  };
}

export async function getConfiguration(ctx: Ctx, bikeId: string): Promise<InstalledPart[]> {
  const { data, error } = await ctx.supabase
    .from("bicycle_components")
    .select(`id, slot, component_id, custom_name, price_paid, currency, installed_on, notes, component:components(${COMPONENT_SELECT})`)
    .eq("bicycle_id", bikeId);
  if (error) throw error;
  return (data as unknown as InstalledJoin[]).map(mapInstalledPart).filter((p): p is InstalledPart => p !== null);
}

export async function getRevisions(ctx: Ctx, bikeId: string, limit = 50): Promise<RevisionRow[]> {
  const { data, error } = await ctx.supabase
    .from("bicycle_build_revisions")
    .select("*")
    .eq("bicycle_id", bikeId)
    .order("revision_number", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getMaintenance(ctx: Ctx, bikeId: string): Promise<MaintenanceRow[]> {
  const { data, error } = await ctx.supabase
    .from("maintenance_records")
    .select("*")
    .eq("bicycle_id", bikeId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export interface DashboardData {
  bikes: GarageBike[];
  recent: GarageBike[];
  upcoming: (MaintenanceRow & { bikeName: string })[];
  activity: (RevisionRow & { bikeName: string })[];
}

export async function getDashboard(ctx: Ctx): Promise<DashboardData> {
  const bikes = await listMyBicycles(ctx);
  const ids = bikes.map((b) => b.id);
  const names = new Map(bikes.map((b) => [b.id, b.name]));
  if (ids.length === 0) return { bikes, recent: [], upcoming: [], activity: [] };
  const [{ data: maint }, { data: revs }] = await Promise.all([
    ctx.supabase.from("maintenance_records").select("*").in("bicycle_id", ids).not("next_due_on", "is", null).order("next_due_on").limit(200),
    ctx.supabase.from("bicycle_build_revisions").select("*").in("bicycle_id", ids).order("created_at", { ascending: false }).limit(8),
  ]);
  const recent = [...bikes]
    .filter((b) => b.last_accessed_at)
    .sort((a, b) => (b.last_accessed_at ?? "").localeCompare(a.last_accessed_at ?? ""))
    .slice(0, 4);
  return {
    bikes,
    recent,
    upcoming: (maint ?? []).map((m) => ({ ...m, bikeName: names.get(m.bicycle_id) ?? "Bicycle" })),
    activity: (revs ?? []).map((r) => ({ ...r, bikeName: names.get(r.bicycle_id) ?? "Bicycle" })),
  };
}

export { toNumber };

export async function getMaintenancePhotos(ctx: Ctx, recordIds: string[]) {
  const map = new Map<string, { id: string; url: string | null }[]>();
  if (recordIds.length === 0) return map;
  const { data } = await ctx.supabase.from("maintenance_photos").select("id, record_id, storage_path").in("record_id", recordIds).order("created_at");
  const paths = (data ?? []).map((p) => p.storage_path);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await ctx.supabase.storage.from("maintenance-media").createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  for (const p of data ?? []) {
    const list = map.get(p.record_id) ?? [];
    list.push({ id: p.id, url: signed.get(p.storage_path) ?? null });
    map.set(p.record_id, list);
  }
  return map;
}
