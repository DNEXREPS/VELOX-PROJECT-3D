import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { PAGE_SIZE, pageRange, sanitizeSearch } from "@/lib/postgrest";
import { signBicycleMedia } from "@/server/storage";
import { isBikeSlot } from "@/lib/domain/slots";
import { toNumber } from "@/server/mappers";
import type { BicycleCategory } from "@/lib/domain/bicycle";
import type { FeedRow, PassportRow } from "@/types/domain";

type Client = NonNullable<ServerSupabase>;

export interface PassportCard extends PassportRow {
  coverUrl: string | null;
}

async function withCovers(supabase: Client, rows: PassportRow[]): Promise<PassportCard[]> {
  const urls = await signBicycleMedia(supabase, rows.map((r) => r.cover_image_path));
  return rows.map((r) => ({ ...r, coverUrl: r.cover_image_path ? (urls.get(r.cover_image_path) ?? null) : null }));
}

export interface ExploreQuery {
  q?: string;
  category?: BicycleCategory;
  brand?: string;
  sort: "recent" | "popular";
  page: number;
}

export async function explorePublicBikes(supabase: Client, query: ExploreQuery, pageSize = PAGE_SIZE) {
  let req = supabase.from("bicycle_passports").select("*", { count: "exact" });
  const q = sanitizeSearch(query.q);
  if (q) req = req.or(`name.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,owner_username.ilike.%${q}%`);
  if (query.category) req = req.eq("category", query.category);
  const brand = sanitizeSearch(query.brand);
  if (brand) req = req.ilike("brand", brand);
  req =
    query.sort === "popular"
      ? req.order("bookmark_count", { ascending: false }).order("created_at", { ascending: false })
      : req.order("created_at", { ascending: false });
  const [from, to] = pageRange(query.page, pageSize);
  const { data, count, error } = await req.order("id").range(from, to);
  if (error) throw error;
  const total = count ?? 0;
  return { items: await withCovers(supabase, data ?? []), total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listPublicBrands(supabase: Client): Promise<string[]> {
  const { data } = await supabase.from("bicycle_passports").select("brand").not("brand", "is", null).limit(1000);
  return [...new Set((data ?? []).map((d) => d.brand!).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function getPassport(supabase: Client, username: string, slug: string) {
  const { data: bike } = await supabase
    .from("bicycle_passports")
    .select("*")
    .eq("owner_username", username.toLowerCase())
    .eq("slug", slug)
    .maybeSingle();
  if (!bike) return null;
  const id = bike.id!;
  const [components, revisions, maintenance, images, posts] = await Promise.all([
    bike.show_components ? supabase.from("passport_components").select("*").eq("bicycle_id", id) : Promise.resolve({ data: [] }),
    bike.show_history
      ? supabase.from("passport_revisions").select("*").eq("bicycle_id", id).order("revision_number", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] }),
    bike.show_maintenance
      ? supabase.from("passport_maintenance").select("*").eq("bicycle_id", id).order("performed_on", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    supabase.from("bicycle_images").select("id, storage_path, caption").eq("bicycle_id", id).order("sort_order"),
    supabase.from("community_feed").select("*").eq("bicycle_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const urls = await signBicycleMedia(supabase, [bike.cover_image_path, ...(images.data ?? []).map((i) => i.storage_path)]);
  return {
    bike,
    coverUrl: bike.cover_image_path ? (urls.get(bike.cover_image_path) ?? null) : null,
    images: (images.data ?? []).map((i) => ({ ...i, url: urls.get(i.storage_path) ?? null })),
    components: (components.data ?? [])
      .filter((c) => c.slot && isBikeSlot(c.slot))
      .map((c) => ({ ...c, weight_g: toNumber(c.weight_g), price_paid: toNumber(c.price_paid), price_reference: toNumber(c.price_reference) })),
    revisions: revisions.data ?? [],
    maintenance: maintenance.data ?? [],
    posts: posts.data ?? [],
  };
}

export async function getProfileByUsername(supabase: Client, username: string) {
  const { data: profile } = await supabase.from("profiles").select("id, username, display_name, bio, location, website_url, avatar_path, created_at").eq("username", username.toLowerCase()).maybeSingle();
  if (!profile) return null;
  const [{ data: stats }, { data: bikes }, { data: posts }] = await Promise.all([
    supabase.from("profile_stats").select("*").eq("id", profile.id).single(),
    supabase.from("bicycle_passports").select("*").eq("owner_id", profile.id).order("created_at", { ascending: false }),
    supabase.from("community_feed").select("*").eq("author_id", profile.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return { profile, stats, bikes: await withCovers(supabase, bikes ?? []), posts: posts ?? [] };
}

export interface FeedPage {
  items: (FeedRow & { coverUrl: string | null })[];
  pageCount: number;
}

export async function getFeed(
  supabase: Client,
  opts: { page: number; sort: "recent" | "popular"; featured?: boolean; following?: string[]; q?: string },
  pageSize = 20,
): Promise<FeedPage> {
  let req = supabase.from("community_feed").select("*", { count: "exact" });
  if (opts.featured) req = req.eq("is_featured", true);
  if (opts.following) req = req.in("author_id", opts.following.length ? opts.following : ["00000000-0000-0000-0000-000000000000"]);
  const q = sanitizeSearch(opts.q);
  if (q) req = req.or(`title.ilike.%${q}%,body.ilike.%${q}%,bicycle_name.ilike.%${q}%`);
  req = opts.sort === "popular" ? req.order("like_count", { ascending: false }).order("created_at", { ascending: false }) : req.order("created_at", { ascending: false });
  const [from, to] = pageRange(opts.page, pageSize);
  const { data, count, error } = await req.order("id").range(from, to);
  if (error) throw error;
  const urls = await signBicycleMedia(supabase, (data ?? []).map((d) => d.bicycle_cover_image_path));
  return {
    items: (data ?? []).map((d) => ({ ...d, coverUrl: d.bicycle_cover_image_path ? (urls.get(d.bicycle_cover_image_path) ?? null) : null })),
    pageCount: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getPost(supabase: Client, postId: string) {
  const { data: post } = await supabase.from("community_feed").select("*").eq("id", postId).maybeSingle();
  if (!post) return null;
  const { data: comments } = await supabase
    .from("post_comments")
    .select("id, body, created_at, updated_at, author_id, status, author:profiles(username, display_name, avatar_path)")
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at");
  const urls = await signBicycleMedia(supabase, [post.bicycle_cover_image_path]);
  return {
    post: { ...post, coverUrl: post.bicycle_cover_image_path ? (urls.get(post.bicycle_cover_image_path) ?? null) : null },
    comments: comments ?? [],
  };
}

export async function getFollowingIds(supabase: Client, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_follows").select("following_id").eq("follower_id", userId);
  return (data ?? []).map((d) => d.following_id);
}

export async function getMyBookmarks(supabase: Client, userId: string) {
  const { data } = await supabase.from("bookmarks").select("bicycle_id").eq("user_id", userId);
  const ids = (data ?? []).map((d) => d.bicycle_id);
  if (ids.length === 0) return [];
  const { data: bikes } = await supabase.from("bicycle_passports").select("*").in("id", ids);
  return withCovers(supabase, bikes ?? []);
}
