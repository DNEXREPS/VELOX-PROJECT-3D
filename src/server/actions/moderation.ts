"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, isModeratorRole } from "@/server/auth";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/action-result";
import { REPORT_TARGETS } from "@/lib/domain/bicycle";

const moderateSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  status: z.enum(["published", "hidden", "removed"]),
});
const resolveSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
  note: z.string().max(1000).optional(),
});

/** UI convenience check; the database functions enforce the moderator role themselves. */
async function moderatorSession() {
  const session = await getSession();
  if (!session || !isModeratorRole(session.profile.role)) return null;
  return session;
}

export async function moderateContent(input: unknown): Promise<ActionResult> {
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid moderation request.");
  const session = await moderatorSession();
  if (!session) return fail("Moderator role required.");
  const { error } = await session.supabase.rpc("moderate_content", {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_status: parsed.data.status,
  });
  if (error) return fromDbError(error);
  revalidatePath("/moderation");
  revalidatePath("/community");
  return ok(undefined, "Moderation applied.");
}

export async function resolveReport(input: unknown): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const session = await moderatorSession();
  if (!session) return fail("Moderator role required.");
  const { error } = await session.supabase.rpc("resolve_report", { p_report_id: parsed.data.reportId, p_status: parsed.data.status, p_note: parsed.data.note });
  if (error) return fromDbError(error);
  revalidatePath("/moderation");
  return ok(undefined, "Report updated.");
}

export async function setPostFeatured(postId: string, featured: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(postId).success) return fail("Invalid post.");
  const session = await moderatorSession();
  if (!session) return fail("Moderator role required.");
  const { error } = await session.supabase.rpc("set_post_featured", { p_post_id: postId, p_featured: featured });
  if (error) return fromDbError(error);
  revalidatePath("/community");
  return ok(undefined, featured ? "Post featured." : "Post un-featured.");
}
