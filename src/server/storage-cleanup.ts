import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { processCleanupJob, type CleanupStorageApi } from "@/lib/storage-cleanup";
import { captureError, captureMessage } from "@/lib/monitoring";

type Client = SupabaseClient<Database>;

export interface CleanupSummary {
  claimed: number;
  done: number;
  retrying: number;
  failed: number;
  removedObjects: number;
}

function bucketApi(client: Client, bucket: string): CleanupStorageApi {
  const b = client.storage.from(bucket);
  return {
    async list(folder, { limit, offset }) {
      const { data, error } = await b.list(folder, { limit, offset, sortBy: { column: "name", order: "asc" } });
      return { data: data?.map((e) => ({ name: e.name, id: e.id ?? null })) ?? null, error: error ? { message: error.message } : null };
    },
    async remove(paths) {
      const { error } = await b.remove(paths);
      return { error: error ? { message: error.message } : null };
    },
  };
}

/**
 * Claim due cleanup jobs and process them.
 *  - With a user's session: only that user's jobs (enforced in SQL).
 *  - With the service role (scheduled route): every user's jobs.
 * Never throws; failures are recorded on the job (retry with backoff) and reported.
 */
export async function runStorageCleanup(client: Client, opts: { limit?: number; trigger: "user" | "cron"; deadline?: number }): Promise<CleanupSummary> {
  const summary: CleanupSummary = { claimed: 0, done: 0, retrying: 0, failed: 0, removedObjects: 0 };
  const { data: jobs, error } = await client.rpc("claim_storage_cleanup_jobs", { p_limit: opts.limit ?? 10 });
  if (error) {
    await captureError(error, { area: "db", op: "storage_cleanup.claim", tags: { trigger: opts.trigger } });
    return summary;
  }
  summary.claimed = jobs?.length ?? 0;

  for (const job of jobs ?? []) {
    if (opts.deadline && Date.now() > opts.deadline) break; // leased jobs become due again after the lease
    let result;
    try {
      result = await processCleanupJob(bucketApi(client, job.bucket), job);
    } catch (e) {
      result = { ok: false as const, removed: 0, error: e instanceof Error ? e.message : "unexpected error" };
    }
    summary.removedObjects += result.removed;

    const { data: status, error: finishError } = await client.rpc("finish_storage_cleanup_job", {
      p_id: job.id,
      p_error: result.ok ? null : result.error,
    });
    if (finishError) {
      await captureError(finishError, { area: "db", op: "storage_cleanup.finish", tags: { jobId: job.id, trigger: opts.trigger } });
      continue;
    }
    if (status === "done") summary.done++;
    else if (status === "failed") summary.failed++;
    else summary.retrying++;

    if (!result.ok) {
      await captureMessage(status === "failed" ? "error" : "warning", "storage", "storage_cleanup.job", result.error, {
        jobId: job.id,
        bucket: job.bucket,
        kind: job.prefix ? "folder" : "object",
        attempt: job.attempts,
        outcome: status,
        removed: result.removed,
        trigger: opts.trigger,
      });
    }
  }
  return summary;
}

/**
 * After a user deletes rows that own media, process that user's queued cleanup jobs
 * once the response has been sent (`after` → Vercel `waitUntil`). Anything not finished
 * here is retried by the scheduled route.
 */
export function scheduleUserCleanup(client: Client) {
  after(async () => {
    try {
      await runStorageCleanup(client, { limit: 20, trigger: "user", deadline: Date.now() + 20_000 });
    } catch (e) {
      await captureError(e, { area: "storage", op: "storage_cleanup.user" });
    }
  });
}

/**
 * Compensate an upload whose database row could not be written. If the immediate
 * delete fails too, the object is queued so it cannot become a permanent orphan.
 */
export async function discardUpload(client: Client, bucket: "bicycle-media" | "maintenance-media" | "avatars", path: string, op: string) {
  const { error } = await client.storage.from(bucket).remove([path]);
  if (!error) return;
  await captureError(error, { area: "storage", op: `${op}.compensate`, level: "warning", tags: { bucket } });
  const { error: queueError } = await client.rpc("request_storage_cleanup", { p_bucket: bucket, p_path: path });
  if (queueError) await captureError(queueError, { area: "db", op: `${op}.compensate_queue`, tags: { bucket } });
}

/** Report a failed Storage call (never includes file contents or user data). */
export function reportStorageError(error: { message: string; statusCode?: string } | Error, op: string, bucket: string) {
  void captureError(error, { area: "storage", op, tags: { bucket } });
}
