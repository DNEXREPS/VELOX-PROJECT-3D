"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { safeRedirectPath } from "@/lib/auth/routes";
import { siteUrl } from "@/lib/env";

const NOT_CONFIGURED = "Authentication is unavailable: Supabase is not configured for this deployment.";

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Generic message: do not reveal whether the email exists.
  if (error) return fail(error.code === "email_not_confirmed" ? "Confirm your email address before signing in." : "Invalid email or password.");
  redirect(safeRedirectPath(next));
}

export async function signUp(input: unknown): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { email, password, username } = parsed.data;

  const { data: available } = await supabase.rpc("is_username_available", { p_username: username });
  if (available === false) return fail("Please correct the highlighted fields.", { username: ["That username is taken."] });

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard` },
  });
  if (error) {
    if (error.code === "weak_password") return fail("Please correct the highlighted fields.", { password: [error.message] });
    if (error.code === "over_email_send_rate_limit" || error.status === 429) return fail("Too many attempts. Please wait a moment and try again.");
    return fail("Could not create the account. Please try again.");
  }
  if (data.session) redirect("/dashboard");
  return ok({ needsConfirmation: true }, "Check your inbox to confirm your email address.");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Always succeed (no account enumeration).
  return ok(undefined, "If an account exists for that email, a reset link is on its way.");
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Your reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.code === "same_password" ? "Choose a password you have not used before." : "Could not update the password.");
  return ok(undefined, "Password updated.");
}
