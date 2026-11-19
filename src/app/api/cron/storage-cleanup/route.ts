import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/server/supabase-admin";
import { runStorageCleanup } from "@/server/storage-cleanup";
import { isAuthorizedBearer } from "@/lib/security/bearer";
import { captureError, captureMessage } from "@/lib/monitoring";

/**
 * Scheduled storage cleanup (Vercel Cron, see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`. Processes pending cleanup jobs for all users
 * with the service role; each job is confined to one owner folder by the database.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 45_000;

export async function GET(request: NextRequest) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const client = createServiceRoleClient();
  if (!client) {
    await captureMessage("error", "cron", "storage_cleanup.config", "Cleanup cron is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const deadline = Date.now() + BUDGET_MS;
  const total = { claimed: 0, done: 0, retrying: 0, failed: 0, removedObjects: 0, batches: 0 };
  try {
    while (Date.now() < deadline) {
      const s = await runStorageCleanup(client, { limit: 25, trigger: "cron", deadline });
      total.batches++;
      total.claimed += s.claimed;
      total.done += s.done;
      total.retrying += s.retrying;
      total.failed += s.failed;
      total.removedObjects += s.removedObjects;
      if (s.claimed < 25) break;
    }
  } catch (e) {
    await captureError(e, { area: "cron", op: "storage_cleanup.run" });
    return NextResponse.json({ error: "cleanup failed", ...total }, { status: 500 });
  }
  if (total.claimed > 0) await captureMessage("info", "cron", "storage_cleanup.summary", "Storage cleanup run finished", total);
  return NextResponse.json(total);
}
