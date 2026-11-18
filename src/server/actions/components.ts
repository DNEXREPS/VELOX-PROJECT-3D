"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/server/auth";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { componentSubmissionSchema, slugify } from "@/lib/validation/schemas";

/** Riders can add parts that are missing from the registry. They are stored as user_submitted (unverified). */
export async function submitComponent(input: unknown): Promise<ActionResult<{ slug: string; id: string }>> {
  const parsed = componentSubmissionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail("Sign in to continue.");
  const d = parsed.data;
  const slug = `${slugify(d.name).slice(0, 100)}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await session.supabase
    .from("components")
    .insert({
      slug,
      name: d.name,
      brand_id: d.brand_id,
      category_id: d.category_id,
      model: d.model ?? null,
      description: d.description ?? null,
      weight_g: d.weight_g ?? null,
      material: d.material ?? null,
      price_reference: d.price_reference ?? null,
      currency: d.currency ?? null,
      manufacturer_ref: d.manufacturer_ref ?? null,
      source_url: d.source_url ?? null,
      verification_status: "user_submitted",
      created_by: session.userId,
    })
    .select("id, slug")
    .single();
  if (error) return fromDbError(error, "Could not submit the component.");
  revalidatePath("/components");
  return ok({ slug: data.slug, id: data.id }, "Component submitted (unverified).");
}

export async function deleteComponent(componentId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Sign in to continue.");
  const { data, error } = await session.supabase.from("components").delete().eq("id", componentId).select("id");
  if (error?.code === "23503") return fail("This component is installed on a bicycle and cannot be deleted.");
  if (error) return fromDbError(error, "Could not delete the component.");
  if (!data?.length) return fail("You can only delete your own unverified submissions.");
  revalidatePath("/components");
  return ok(undefined, "Component deleted.");
}
