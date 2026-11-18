"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { bicycleSchema, IMAGE_MAX_BYTES, passportSettingsSchema, slugify } from "@/lib/validation/schemas";
import { EXTENSION, validateImageFile } from "@/lib/uploads";
import { DEFAULT_MODEL_KEY } from "@/features/studio/models/registry";

const uuid = z.uuid();
const AUTH = "Sign in to continue.";

async function uniqueSlug(supabase: NonNullable<Awaited<ReturnType<typeof getSession>>>["supabase"], ownerId: string, name: string, excludeId?: string) {
  const base = slugify(name);
  const { data } = await supabase.from("bicycles").select("id, slug").eq("owner_id", ownerId).like("slug", `${base}%`);
  const taken = new Set((data ?? []).filter((b) => b.id !== excludeId).map((b) => b.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${randomUUID().slice(0, 6)}`;
}

function splitInput(data: z.infer<typeof bicycleSchema>) {
  const { serial_number, purchase_price, purchase_currency, purchase_date, is_primary, ...bike } = data;
  return {
    bike: {
      ...bike,
      brand: bike.brand ?? null,
      model: bike.model ?? null,
      frame_material: bike.frame_material ?? null,
      frame_size: bike.frame_size ?? null,
      model_year: bike.model_year ?? null,
      color: bike.color ?? null,
      color_hex: bike.color_hex ?? null,
      weight_kg: bike.weight_kg ?? null,
      estimated_value: bike.estimated_value ?? null,
      description: bike.description ?? null,
    },
    isPrimary: is_primary,
    priv: {
      serial_number: serial_number ?? null,
      purchase_price: purchase_price ?? null,
      purchase_currency,
      purchase_date: purchase_date ?? null,
    },
  };
}

export async function createBicycle(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = bicycleSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { bike, priv, isPrimary } = splitInput(parsed.data);

  const slug = await uniqueSlug(supabase, userId, bike.name);
  const { data, error } = await supabase
    .from("bicycles")
    .insert({ ...bike, slug, owner_id: userId, model_key: DEFAULT_MODEL_KEY })
    .select("id")
    .single();
  if (error) return fromDbError(error, "Could not create the bicycle.");

  const { error: privError } = await supabase.from("bicycle_private_details").insert({ ...priv, bicycle_id: data.id, owner_id: userId });
  if (privError) return fromDbError(privError, "Bicycle created, but private details could not be saved.");

  const { count } = await supabase.from("bicycles").select("id", { count: "exact", head: true }).eq("owner_id", userId);
  if (isPrimary || count === 1) await supabase.rpc("set_primary_bicycle", { p_bicycle_id: data.id });

  revalidatePath("/garage");
  revalidatePath("/dashboard");
  return ok({ id: data.id });
}

export async function updateBicycle(bikeId: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(bikeId).success) return fail("Invalid bicycle.");
  const parsed = bicycleSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { bike, priv, isPrimary } = splitInput(parsed.data);

  const { data: updated, error } = await supabase.from("bicycles").update(bike).eq("id", bikeId).eq("owner_id", userId).select("id");
  if (error) return fromDbError(error, "Could not save the bicycle.");
  if (!updated?.length) return fail("Bicycle not found.");

  const { error: privError } = await supabase
    .from("bicycle_private_details")
    .upsert({ ...priv, bicycle_id: bikeId, owner_id: userId }, { onConflict: "bicycle_id" });
  if (privError) return fromDbError(privError, "Could not save private details.");
  if (isPrimary) await supabase.rpc("set_primary_bicycle", { p_bicycle_id: bikeId });

  revalidatePath(`/garage/${bikeId}`, "layout");
  return ok(undefined, "Bicycle saved.");
}

export async function deleteBicycle(bikeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(bikeId).success) return fail("Invalid bicycle.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: bike } = await supabase.from("bicycles").select("id").eq("id", bikeId).eq("owner_id", userId).maybeSingle();
  if (!bike) return fail("Bicycle not found.");

  // Remove media first (storage objects are not cascaded by the database).
  const prefix = `${userId}/${bikeId}`;
  const { data: files } = await supabase.storage.from("bicycle-media").list(prefix, { limit: 1000 });
  if (files?.length) await supabase.storage.from("bicycle-media").remove(files.map((f) => `${prefix}/${f.name}`));
  const { data: records } = await supabase.from("maintenance_records").select("id").eq("bicycle_id", bikeId);
  for (const r of records ?? []) {
    const mp = `${userId}/${r.id}`;
    const { data: mf } = await supabase.storage.from("maintenance-media").list(mp, { limit: 1000 });
    if (mf?.length) await supabase.storage.from("maintenance-media").remove(mf.map((f) => `${mp}/${f.name}`));
  }

  const { error } = await supabase.from("bicycles").delete().eq("id", bikeId).eq("owner_id", userId);
  if (error) return fromDbError(error, "Could not delete the bicycle.");
  revalidatePath("/garage");
  revalidatePath("/dashboard");
  return ok(undefined, "Bicycle deleted.");
}

export async function setPrimaryBicycle(bikeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(bikeId).success) return fail("Invalid bicycle.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { error } = await session.supabase.rpc("set_primary_bicycle", { p_bicycle_id: bikeId });
  if (error) return fromDbError(error);
  revalidatePath("/garage");
  revalidatePath("/dashboard");
  return ok(undefined, "Primary bicycle updated.");
}

export async function updatePassportSettings(bikeId: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(bikeId).success) return fail("Invalid bicycle.");
  const parsed = passportSettingsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { data, error } = await session.supabase.from("bicycles").update(parsed.data).eq("id", bikeId).eq("owner_id", session.userId).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Bicycle not found.");
  revalidatePath(`/garage/${bikeId}`, "layout");
  return ok(undefined, "Passport settings saved.");
}

export async function uploadBicycleImage(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const bikeId = String(formData.get("bicycleId") ?? "");
  if (!uuid.safeParse(bikeId).success) return fail("Invalid bicycle.");
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 200) || null;
  const makeCover = formData.get("makeCover") === "on" || formData.get("makeCover") === "true";
  const check = await validateImageFile(formData.get("file"), IMAGE_MAX_BYTES);
  if (!check.ok) return fail(check.error);

  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: bike } = await supabase.from("bicycles").select("id, cover_image_path").eq("id", bikeId).eq("owner_id", userId).maybeSingle();
  if (!bike) return fail("Bicycle not found.");

  const path = `${userId}/${bikeId}/${randomUUID()}.${EXTENSION[check.mime]}`;
  const { error: upErr } = await supabase.storage.from("bicycle-media").upload(path, check.bytes, { contentType: check.mime, upsert: false });
  if (upErr) return fail("Upload failed. Please try again.");

  const { data: img, error } = await supabase.from("bicycle_images").insert({ bicycle_id: bikeId, owner_id: userId, storage_path: path, caption }).select("id").single();
  if (error) {
    await supabase.storage.from("bicycle-media").remove([path]);
    return fromDbError(error, "Could not save the image.");
  }
  if (makeCover || !bike.cover_image_path) await supabase.from("bicycles").update({ cover_image_path: path }).eq("id", bikeId);
  revalidatePath(`/garage/${bikeId}`, "layout");
  return ok({ id: img.id }, "Image uploaded.");
}

export async function deleteBicycleImage(imageId: string): Promise<ActionResult> {
  if (!uuid.safeParse(imageId).success) return fail("Invalid image.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: img } = await supabase.from("bicycle_images").select("id, bicycle_id, storage_path").eq("id", imageId).eq("owner_id", userId).maybeSingle();
  if (!img) return fail("Image not found.");
  await supabase.storage.from("bicycle-media").remove([img.storage_path]);
  const { error } = await supabase.from("bicycle_images").delete().eq("id", imageId);
  if (error) return fromDbError(error);
  const { data: bike } = await supabase.from("bicycles").select("cover_image_path").eq("id", img.bicycle_id).single();
  if (bike?.cover_image_path === img.storage_path) {
    const { data: next } = await supabase.from("bicycle_images").select("storage_path").eq("bicycle_id", img.bicycle_id).order("sort_order").limit(1).maybeSingle();
    await supabase.from("bicycles").update({ cover_image_path: next?.storage_path ?? null }).eq("id", img.bicycle_id);
  }
  revalidatePath(`/garage/${img.bicycle_id}`, "layout");
  return ok(undefined, "Image deleted.");
}

export async function setCoverImage(imageId: string): Promise<ActionResult> {
  if (!uuid.safeParse(imageId).success) return fail("Invalid image.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: img } = await supabase.from("bicycle_images").select("bicycle_id, storage_path").eq("id", imageId).eq("owner_id", userId).maybeSingle();
  if (!img) return fail("Image not found.");
  const { error } = await supabase.from("bicycles").update({ cover_image_path: img.storage_path }).eq("id", img.bicycle_id).eq("owner_id", userId);
  if (error) return fromDbError(error);
  revalidatePath(`/garage/${img.bicycle_id}`, "layout");
  return ok(undefined, "Cover image updated.");
}
