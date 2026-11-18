/**
 * Storage cleanup worker logic (framework-free, unit-tested).
 *
 * A job is either a single object (`object_path`) or a whole entity folder (`prefix`,
 * "<owner>/<entity>/", enforced by database CHECK constraints). Folder jobs list
 * recursively with pagination (Supabase returns at most 1,000 entries per call), remove
 * in batches, and repeat until the folder is empty, so folders of any size are handled.
 * Every removal is checked against the job scope before it is sent.
 */
export interface CleanupJob {
  id: number;
  bucket: string;
  object_path: string | null;
  prefix: string | null;
  attempts: number;
}

export interface StorageEntry {
  name: string;
  /** Supabase returns `id: null` for folders (common prefixes). */
  id: string | null;
}

export interface StorageError {
  message: string;
}

export interface CleanupStorageApi {
  list(folder: string, options: { limit: number; offset: number }): Promise<{ data: StorageEntry[] | null; error: StorageError | null }>;
  remove(paths: string[]): Promise<{ error: StorageError | null }>;
}

export type CleanupResult = { ok: true; removed: number } | { ok: false; removed: number; error: string };

export const LIST_PAGE_SIZE = 1000;
export const REMOVE_BATCH_SIZE = 500;
const MAX_ROUNDS = 25;
const MAX_LIST_CALLS = 2000;

/** True when `path` is a real object path strictly inside the folder `prefix` ("a/b/"). */
export function isWithinPrefix(path: string, prefix: string): boolean {
  if (!prefix.endsWith("/") || prefix.length < 3) return false;
  if (!path.startsWith(prefix) || path.length === prefix.length) return false;
  return !path.split("/").some((seg) => seg === "" || seg === "." || seg === "..");
}

function isSafeObjectPath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.split("/").some((seg) => seg === "" || seg === "." || seg === "..");
}

class ListError extends Error {}

/** Recursively collect object paths under `folder` (no trailing slash), up to `cap`. */
async function collect(api: CleanupStorageApi, folder: string, cap: number, budget: { calls: number }): Promise<string[]> {
  const files: string[] = [];
  const folders: string[] = [folder];
  while (folders.length > 0 && files.length < cap) {
    const current = folders.shift()!;
    for (let offset = 0; files.length < cap; offset += LIST_PAGE_SIZE) {
      if (++budget.calls > MAX_LIST_CALLS) throw new ListError("listing budget exhausted");
      const { data, error } = await api.list(current, { limit: LIST_PAGE_SIZE, offset });
      if (error) throw new ListError(`list ${current}: ${error.message}`);
      const page = data ?? [];
      for (const entry of page) {
        if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/")) continue;
        const full = `${current}/${entry.name}`;
        // `.emptyFolderPlaceholder` objects are real objects and are removed like any other.
        if (entry.id === null) folders.push(full);
        else files.push(full);
      }
      if (page.length < LIST_PAGE_SIZE) break;
    }
  }
  return files.slice(0, cap);
}

export async function processCleanupJob(api: CleanupStorageApi, job: CleanupJob, opts: { maxObjectsPerRound?: number } = {}): Promise<CleanupResult> {
  if (job.object_path) {
    if (!isSafeObjectPath(job.object_path)) return { ok: false, removed: 0, error: "refused: unsafe object path" };
    const { error } = await api.remove([job.object_path]);
    // Removing an object that no longer exists is not an error in Supabase Storage.
    return error ? { ok: false, removed: 0, error: `remove: ${error.message}` } : { ok: true, removed: 1 };
  }

  const prefix = job.prefix;
  if (!prefix || !prefix.endsWith("/") || !isSafeObjectPath(prefix.slice(0, -1)) || prefix.split("/").length < 3) {
    return { ok: false, removed: 0, error: "refused: unsafe prefix" };
  }

  const cap = Math.max(1, opts.maxObjectsPerRound ?? 10_000);
  const folder = prefix.slice(0, -1);
  const budget = { calls: 0 };
  let removed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let files: string[];
    try {
      files = await collect(api, folder, cap, budget);
    } catch (e) {
      return { ok: false, removed, error: e instanceof Error ? e.message : "list failed" };
    }
    if (files.length === 0) return { ok: true, removed };

    const outside = files.find((f) => !isWithinPrefix(f, prefix));
    if (outside) return { ok: false, removed, error: "refused: listing returned an object outside the job scope" };

    for (let i = 0; i < files.length; i += REMOVE_BATCH_SIZE) {
      const batch = files.slice(i, i + REMOVE_BATCH_SIZE);
      const { error } = await api.remove(batch);
      if (error) return { ok: false, removed, error: `remove: ${error.message}` };
      removed += batch.length;
    }
  }
  return { ok: false, removed, error: "objects still present after repeated removal rounds" };
}
