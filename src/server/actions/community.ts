"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { commentSchema, postSchema, reportSchema } from "@/lib/validation/schemas";

const uuid = z.uuid();
const AUTH = "Sign in to take part in the community.";

export async function createPost(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { data, error } = await session.supabase
    .from("community_posts")
    .insert({ author_id: session.userId, title: parsed.data.title, body: parsed.data.body, bicycle_id: parsed.data.bicycle_id ?? null })
    .select("id")
    .single();
  if (error) return fromDbError(error, error.code === "23514" ? "Only your own public bicycles can be linked." : "Could not publish the post.", "post.create");
  revalidatePath("/community");
  return ok({ id: data.id }, "Post published.");
}

export async function updatePost(postId: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(postId).success) return fail("Invalid post.");
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { data, error } = await session.supabase
    .from("community_posts")
    .update({ title: parsed.data.title, body: parsed.data.body, bicycle_id: parsed.data.bicycle_id ?? null })
    .eq("id", postId)
    .eq("author_id", session.userId)
    .select("id");
  if (error) return fromDbError(error, "Could not update the post.");
  if (!data?.length) return fail("You can only edit your own posts.");
  revalidatePath(`/community/${postId}`);
  return ok(undefined, "Post updated.");
}

export async function deletePost(postId: string): Promise<ActionResult> {
  if (!uuid.safeParse(postId).success) return fail("Invalid post.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  // RLS: author or moderator.
  const { data, error } = await session.supabase.from("community_posts").delete().eq("id", postId).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("You can only delete your own posts.");
  revalidatePath("/community");
  return ok(undefined, "Post deleted.");
}

export async function toggleLike(postId: string): Promise<ActionResult<{ liked: boolean }>> {
  if (!uuid.safeParse(postId).success) return fail("Invalid post.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: existing } = await supabase.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", userId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) return fromDbError(error);
    return ok({ liked: false });
  }
  const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
  if (error && error.code !== "23505") return fromDbError(error, "Could not like this post.");
  return ok({ liked: true });
}

export async function addComment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { data, error } = await session.supabase
    .from("post_comments")
    .insert({ post_id: parsed.data.postId, author_id: session.userId, body: parsed.data.body })
    .select("id")
    .single();
  if (error) return fromDbError(error, "Could not add the comment.", "comment.create");
  revalidatePath(`/community/${parsed.data.postId}`);
  return ok({ id: data.id });
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(commentId).success) return fail("Invalid comment.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { data, error } = await session.supabase.from("post_comments").delete().eq("id", commentId).select("post_id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("You can only delete your own comments.");
  revalidatePath(`/community/${data[0].post_id}`);
  return ok(undefined, "Comment deleted.");
}

export async function toggleFollow(profileId: string): Promise<ActionResult<{ following: boolean }>> {
  if (!uuid.safeParse(profileId).success) return fail("Invalid profile.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  if (profileId === userId) return fail("You cannot follow yourself.");
  const { data: existing } = await supabase.from("user_follows").select("following_id").eq("follower_id", userId).eq("following_id", profileId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("user_follows").delete().eq("follower_id", userId).eq("following_id", profileId);
    if (error) return fromDbError(error);
    return ok({ following: false });
  }
  const { error } = await supabase.from("user_follows").insert({ follower_id: userId, following_id: profileId });
  if (error && error.code !== "23505") return fromDbError(error);
  return ok({ following: true });
}

export async function toggleBookmark(bicycleId: string): Promise<ActionResult<{ bookmarked: boolean }>> {
  if (!uuid.safeParse(bicycleId).success) return fail("Invalid bicycle.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: existing } = await supabase.from("bookmarks").select("bicycle_id").eq("user_id", userId).eq("bicycle_id", bicycleId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("bookmarks").delete().eq("user_id", userId).eq("bicycle_id", bicycleId);
    if (error) return fromDbError(error);
    return ok({ bookmarked: false });
  }
  const { error } = await supabase.from("bookmarks").insert({ user_id: userId, bicycle_id: bicycleId });
  if (error && error.code !== "23505") return fromDbError(error, "This bicycle can no longer be saved.");
  return ok({ bookmarked: true });
}

export async function reportContent(input: unknown): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail("Sign in to report content.");
  const { error } = await session.supabase.from("content_reports").insert({ ...parsed.data, details: parsed.data.details ?? null, reporter_id: session.userId });
  if (error?.code === "23505") return ok(undefined, "You have already reported this. Our moderators will review it.");
  if (error) return fromDbError(error, "Could not submit the report.", "report.create");
  return ok(undefined, "Thanks — a moderator will review this report.");
}
