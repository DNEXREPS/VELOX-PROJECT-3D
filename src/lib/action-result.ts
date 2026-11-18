import type { z } from "zod";
import { captureError, captureMessage } from "@/lib/monitoring";

export type ActionFailure = { ok: false; error: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | ActionFailure;

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionFailure {
  return { ok: false, error, fieldErrors };
}

export function fromZodError(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
}

export const RATE_LIMIT_MESSAGE = "You're doing that too often. Please wait a few minutes and try again.";

/** Postgres/PostgREST outcomes that are normal user-input results, not incidents. */
const EXPECTED_DB_CODES = new Set(["23505", "23503", "23514", "22023", "PGRST116"]);

/**
 * Maps Postgres / PostgREST errors to safe user-facing messages (no internals leaked)
 * and reports unexpected ones to monitoring. `op` names the operation for the report.
 */
export function fromDbError(error: { code?: string; message?: string } | null | undefined, fallback = "Something went wrong.", op = "db"): ActionFailure {
  if (!error) return fail(fallback);
  reportDbError(error, op);
  switch (error.code) {
    case "23505":
      return fail("That already exists — try a different name or slug.");
    case "23503":
      return fail("A referenced record no longer exists.");
    case "23514":
      return fail(error.message?.includes("must") ? error.message : "Some values are outside the allowed range.");
    case "42501":
      return fail("You do not have permission to do that.");
    case "PT429":
      return fail(RATE_LIMIT_MESSAGE);
    case "22023":
      return fail(error.message ?? fallback);
    case "PGRST116":
      return fail("Not found.");
    default:
      return fail(fallback);
  }
}

function reportDbError(error: { code?: string; message?: string }, op: string) {
  if (error.code && EXPECTED_DB_CODES.has(error.code)) return;
  if (error.code === "PT429") {
    // Abuse signal; the message names the limited action only.
    void captureMessage("warning", "security", `${op}.rate_limited`, error.message ?? "rate limited", { code: error.code });
    return;
  }
  if (error.code === "42501") {
    void captureMessage("warning", "security", `${op}.denied`, "Permission denied by the database", { code: error.code });
    return;
  }
  void captureError(error, { area: "db", op });
}
