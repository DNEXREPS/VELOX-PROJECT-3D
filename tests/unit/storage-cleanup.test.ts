import { describe, expect, it } from "vitest";
import { isWithinPrefix, processCleanupJob, LIST_PAGE_SIZE, REMOVE_BATCH_SIZE, type CleanupStorageApi, type StorageEntry } from "@/lib/storage-cleanup";

const OWNER = "a0000000-0000-4000-8000-00000000000a";
const BIKE = "b0000000-0000-4000-8000-00000000000b";
const PREFIX = `${OWNER}/${BIKE}/`;

/** In-memory bucket that behaves like Supabase Storage list/remove (folders have id null). */
function fakeBucket(paths: string[], opts: { failRemoveAfter?: number; failList?: boolean; listExtra?: string[] } = {}) {
  const objects = new Set(paths);
  const calls = { list: 0, remove: 0, removed: [] as string[] };
  const api: CleanupStorageApi = {
    async list(folder, { limit, offset }) {
      calls.list++;
      if (opts.failList) return { data: null, error: { message: "list unavailable" } };
      const base = `${folder}/`;
      const entries = new Map<string, StorageEntry>();
      for (const p of objects) {
        if (!p.startsWith(base)) continue;
        const rest = p.slice(base.length);
        const [head, ...tail] = rest.split("/");
        entries.set(head, { name: head, id: tail.length ? null : `id-${p}` });
      }
      for (const extra of opts.listExtra ?? []) entries.set(extra, { name: extra, id: "x" });
      const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
      return { data: sorted.slice(offset, offset + limit), error: null };
    },
    async remove(batch) {
      calls.remove++;
      expect(batch.length).toBeLessThanOrEqual(REMOVE_BATCH_SIZE);
      if (opts.failRemoveAfter !== undefined && calls.remove > opts.failRemoveAfter) return { error: { message: "storage timeout" } };
      for (const p of batch) {
        objects.delete(p);
        calls.removed.push(p);
      }
      return { error: null };
    },
  };
  return { api, objects, calls };
}

const job = (over: Partial<{ object_path: string | null; prefix: string | null }>) => ({ id: 1, bucket: "bicycle-media", attempts: 1, object_path: null, prefix: null, ...over });

describe("storage cleanup worker", () => {
  it("removes a single object", async () => {
    const { api, objects } = fakeBucket([`${OWNER}/a.png`, `${OWNER}/b.png`]);
    expect(await processCleanupJob(api, job({ object_path: `${OWNER}/a.png` }))).toEqual({ ok: true, removed: 1 });
    expect([...objects]).toEqual([`${OWNER}/b.png`]);
  });

  it("empties a folder with more than 1,000 objects, including sub-folders, and nothing else", async () => {
    const inside = Array.from({ length: 2345 }, (_, i) => `${PREFIX}${String(i).padStart(5, "0")}.jpg`);
    const nested = [`${PREFIX}thumbs/1.jpg`, `${PREFIX}thumbs/deep/2.jpg`];
    const unrelated = [`${OWNER}/other-bike/1.jpg`, `${OWNER}/${BIKE}x/evil.jpg`, `${OWNER}/avatar.png`];
    const { api, objects, calls } = fakeBucket([...inside, ...nested, ...unrelated]);

    const r = await processCleanupJob(api, job({ prefix: PREFIX }));
    expect(r).toEqual({ ok: true, removed: inside.length + nested.length });
    expect([...objects].sort()).toEqual([...unrelated].sort());
    expect(calls.list).toBeGreaterThan(Math.ceil(inside.length / LIST_PAGE_SIZE)); // paginated
  });

  it("is idempotent: an already-empty folder succeeds", async () => {
    const { api } = fakeBucket([`${OWNER}/other/1.jpg`]);
    expect(await processCleanupJob(api, job({ prefix: PREFIX }))).toEqual({ ok: true, removed: 0 });
  });

  it("reports partial failure so the job is retried, and a retry finishes the work", async () => {
    const files = Array.from({ length: 1200 }, (_, i) => `${PREFIX}${i}.jpg`);
    const first = fakeBucket(files, { failRemoveAfter: 1 });
    const r1 = await processCleanupJob(first.api, job({ prefix: PREFIX }));
    expect(r1).toMatchObject({ ok: false, removed: REMOVE_BATCH_SIZE, error: "remove: storage timeout" });

    const retry = fakeBucket([...first.objects]);
    expect(await processCleanupJob(retry.api, job({ prefix: PREFIX }))).toEqual({ ok: true, removed: 1200 - REMOVE_BATCH_SIZE });
    expect(retry.objects.size).toBe(0);
  });

  it("fails (retryably) when listing fails", async () => {
    const { api } = fakeBucket([`${PREFIX}1.jpg`], { failList: true });
    expect(await processCleanupJob(api, job({ prefix: PREFIX }))).toMatchObject({ ok: false, error: expect.stringContaining("list unavailable") });
  });

  it("refuses unsafe scopes before touching storage", async () => {
    const { api, calls } = fakeBucket([`${OWNER}/a.png`]);
    for (const j of [job({ prefix: `${OWNER}/` }), job({ prefix: "/" }), job({ prefix: `${OWNER}/../x/` }), job({ object_path: `${OWNER}/../x.png` }), job({ object_path: "/abs.png" }), job({})]) {
      expect((await processCleanupJob(api, j)).ok).toBe(false);
    }
    expect(calls.remove).toBe(0);
  });

  it("never removes entries that are not real children of the prefix", async () => {
    const { api, calls } = fakeBucket([`${PREFIX}ok.jpg`], { listExtra: ["..", "a/b"] });
    expect((await processCleanupJob(api, job({ prefix: PREFIX }))).ok).toBe(true);
    expect(calls.removed).toEqual([`${PREFIX}ok.jpg`]);
  });

  it("scope helper", () => {
    expect(isWithinPrefix(`${PREFIX}a.jpg`, PREFIX)).toBe(true);
    expect(isWithinPrefix(`${PREFIX}`, PREFIX)).toBe(false);
    expect(isWithinPrefix(`${OWNER}/${BIKE}x/a.jpg`, PREFIX)).toBe(false);
    expect(isWithinPrefix(`${PREFIX}../a.jpg`, PREFIX)).toBe(false);
  });
});
