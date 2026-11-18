"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { IMAGE_MAX_BYTES, maintenanceSchema, type MaintenanceInput } from "@/lib/validation/schemas";
import { EXTENSION, validateImageFile } from "@/lib/uploads";

const uuid = z.uuid();
const AUTH = "Sign in to continue.";

function toRow(d: MaintenanceInput) {
  return {
    maintenance_type: d.maintenance_type,
    title: d.title,
    performed_on: d.performed_on,
    slot: d.slot ?? null,
    cost: d.cost ?? null,
    currency: d.cost !== undefined ? (d.currency ?? null) : null,
    distance_km: d.distance_km ?? null,
    notes: d.notes ?? null,
    next_due_on: d.next_due_on ?? null,
    next_due_distance_km: d.next_due_distance_km ?? null,
  };
}

async function linkComponent(supabase: NonNullable<Awaited<ReturnType<typeof getSession>>>["supabase"], bikeId: string, slot: string | null) {
  if (!slot) return null;
  const { data } = await supabase.from("bicycle_components").select("id").eq("bicycle_id", bikeId).eq("slot", slot as never).maybeSingle();
  return data?.id ?? null;
}

export async function createMaintenance(bikeId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(bikeId).success) return fail("Invalid bicycle.");
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const row = toRow(parsed.data);
  const { data, error } = await session.supabase
    .from("maintenance_records")
    .insert({ ...row, bicycle_id: bikeId, owner_id: session.userId, bicycle_component_id: await linkComponent(session.supabase, bikeId, row.slot) })
    .select("id")
    .single();
  if (error) return fromDbError(error, "Could not save the record.");
  revalidatePath(`/garage/${bikeId}`, "layout");
  revalidatePath("/dashboard");
  return ok({ id: data.id }, "Maintenance recorded.");
}

export async function updateMaintenance(recordId: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(recordId).success) return fail("Invalid record.");
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { data: existing } = await session.supabase.from("maintenance_records").select("bicycle_id").eq("id", recordId).eq("owner_id", session.userId).maybeSingle();
  if (!existing) return fail("Record not found.");
  const row = toRow(parsed.data);
  const { error } = await session.supabase
    .from("maintenance_records")
    .update({ ...row, bicycle_component_id: await linkComponent(session.supabase, existing.bicycle_id, row.slot) })
    .eq("id", recordId);
  if (error) return fromDbError(error, "Could not update the record.");
  revalidatePath(`/garage/${existing.bicycle_id}`, "layout");
  return ok(undefined, "Record updated.");
}

export async function deleteMaintenance(recordId: string): Promise<ActionResult> {
  if (!uuid.safeParse(recordId).success) return fail("Invalid record.");
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: photos } = await supabase.from("maintenance_photos").select("storage_path").eq("record_id", recordId);
  if (photos?.length) await supabase.storage.from("maintenance-media").remove(photos.map((p) => p.storage_path));
  const { data, error } = await supabase.from("maintenance_records").delete().eq("id", recordId).eq("owner_id", userId).select("bicycle_id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Record not found.");
  revalidatePath(`/garage/${data[0].bicycle_id}`, "layout");
  return ok(undefined, "Record deleted.");
}

export async function uploadMaintenancePhoto(formData: FormData): Promise<ActionResult> {
  const recordId = String(formData.get("recordId") ?? "");
  if (!uuid.safeParse(recordId).success) return fail("Invalid record.");
  const check = await validateImageFile(formData.get("file"), IMAGE_MAX_BYTES);
  if (!check.ok) return fail(check.error);
  const session = await getSession();
  if (!session) return fail(AUTH);
  const { supabase, userId } = session;
  const { data: rec } = await supabase.from("maintenance_records").select("id, bicycle_id").eq("id", recordId).eq("owner_id", userId).maybeSingle();
  if (!rec) return fail("Record not found.");
  const path = `${userId}/${recordId}/${randomUUID()}.${EXTENSION[check.mime]}`;
  const { error: upErr } = await supabase.storage.from("maintenance-media").upload(path, check.bytes, { contentType: check.mime });
  if (upErr) return fail("Upload failed. Please try again.");
  const { error } = await supabase.from("maintenance_photos").insert({ record_id: recordId, owner_id: userId, storage_path: path });
  if (error) {
    await supabase.storage.from("maintenance-media").remove([path]);
    return fromDbError(error);
  }
  revalidatePath(`/garage/${rec.bicycle_id}/maintenance`);
  return ok(undefined, "Photo added.");
}
