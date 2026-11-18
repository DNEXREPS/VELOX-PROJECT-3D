import type { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function fromZodError(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
}

/** Maps Postgres / PostgREST errors to safe user-facing messages (no internals leaked). */
export function fromDbError(error: { code?: string; message?: string } | null | undefined, fallback = "Something went wrong."): ActionResult<never> {
  if (!error) return fail(fallback);
  switch (error.code) {
    case "23505":
      return fail("That already exists — try a different name or slug.");
    case "23503":
      return fail("A referenced record no longer exists.");
    case "23514":
      return fail(error.message?.includes("must") ? error.message : "Some values are outside the allowed range.");
    case "42501":
      return fail("You do not have permission to do that.");
    case "22023":
      return fail(error.message ?? fallback);
    case "PGRST116":
      return fail("Not found.");
    default:
      return fail(fallback);
  }
}
