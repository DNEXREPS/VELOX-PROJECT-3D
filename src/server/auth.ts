import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface SessionContext {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  email: string | null;
  profile: Profile;
}

/**
 * Resolve the authenticated user for this request (memoised per request).
 * Uses auth.getUser(), which validates the JWT with Supabase Auth — never trust
 * a client-supplied user id.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;
  return { supabase, userId: user.id, email: user.email ?? null, profile };
});

/** For pages/actions that require a signed-in user. */
export async function requireSession(nextPath?: string): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return session;
}

export function isModeratorRole(role: Profile["role"]): boolean {
  return role === "moderator" || role === "admin";
}
