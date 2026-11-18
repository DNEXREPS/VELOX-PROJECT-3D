"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/server/auth";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { applyConfigurationSchema } from "@/lib/validation/schemas";

/**
 * Persist a configuration change. The database function verifies ownership,
 * validates slot/category fit, and appends an immutable build revision atomically.
 */
export async function applyConfiguration(input: unknown): Promise<ActionResult<{ revision: number }>> {
  const parsed = applyConfigurationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail("Sign in to continue.");
  const { bicycleId, changes, description } = parsed.data;

  const { data, error } = await session.supabase.rpc("apply_bicycle_configuration", {
    p_bicycle_id: bicycleId,
    p_changes: changes,
    p_description: description || undefined,
  });
  if (error) {
    if (error.message?.includes("configuration unchanged")) return fail("Nothing changed — the configuration is identical.");
    if (error.message?.includes("does not fit slot")) return fail("One of the selected parts does not fit that position.");
    return fromDbError(error, "Could not save the configuration.");
  }
  revalidatePath(`/garage/${bicycleId}`, "layout");
  return ok({ revision: data.revision_number }, `Saved as revision ${data.revision_number}.`);
}
