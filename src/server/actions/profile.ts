"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/server/auth";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { AVATAR_MAX_BYTES, profileSchema } from "@/lib/validation/schemas";
import { EXTENSION, validateImageFile } from "@/lib/uploads";
import { discardUpload, reportStorageError, scheduleUserCleanup } from "@/server/storage-cleanup";

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail("Sign in to continue.");
  const d = parsed.data;
  if (d.username !== session.profile.username) {
    const { data: available } = await session.supabase.rpc("is_username_available", { p_username: d.username });
    if (!available) return fail("Please correct the highlighted fields.", { username: ["That username is taken."] });
  }
  const { error } = await session.supabase
    .from("profiles")
    .update({ username: d.username, display_name: d.display_name ?? null, bio: d.bio ?? null, location: d.location ?? null, website_url: d.website_url ?? null })
    .eq("id", session.userId);
  if (error) return fromDbError(error, "Could not save your profile.");
  revalidatePath("/", "layout");
  return ok(undefined, "Profile saved.");
}

export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const check = await validateImageFile(formData.get("file"), AVATAR_MAX_BYTES);
  if (!check.ok) return fail(check.error);
  const session = await getSession();
  if (!session) return fail("Sign in to continue.");
  const { supabase, userId, profile } = session;
  const path = `${userId}/${randomUUID()}.${EXTENSION[check.mime]}`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, check.bytes, { contentType: check.mime });
  if (upErr) {
    reportStorageError(upErr, "avatar.upload", "avatars");
    return fail("Upload failed. Please try again.");
  }
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) {
    await discardUpload(supabase, "avatars", path, "avatar.upload");
    return fromDbError(error, "Could not save your avatar.", "avatar.update");
  }
  // The previous avatar is queued for removal by a database trigger.
  if (profile.avatar_path) scheduleUserCleanup(supabase);
  revalidatePath("/", "layout");
  return ok(undefined, "Avatar updated.");
}

export async function removeAvatar(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Sign in to continue.");
  const { error } = await session.supabase.from("profiles").update({ avatar_path: null }).eq("id", session.userId);
  if (error) return fromDbError(error, "Could not remove your avatar.", "avatar.remove");
  if (session.profile.avatar_path) scheduleUserCleanup(session.supabase);
  revalidatePath("/", "layout");
  return ok(undefined, "Avatar removed.");
}
