/**
 * Publish public/model-assets to the PUBLIC Supabase Storage bucket `model-assets` of the
 * LOCAL stack (P0 hosting spike). Refuses any non-local project. Files are immutable and
 * content-addressed: existing paths are never overwritten (except the manifest pointer).
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/assets/publish-local.mts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error("P0: publishing is restricted to the LOCAL Supabase stack");
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const BUCKET = "model-assets";
const DIR = join(import.meta.dirname, "..", "..", "public", "model-assets");
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await sb.storage.getBucket(BUCKET);
if (!existing) {
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ["model/gltf-binary", "image/ktx2", "image/png", "image/webp", "application/json"],
  });
  if (error) throw error;
  console.log(`created public bucket ${BUCKET}`);
}

const MIME: Record<string, string> = { ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let uploaded = 0;
let skipped = 0;
for (const file of walk(DIR)) {
  const path = relative(DIR, file);
  const pointer = path === "manifest.json";
  const ext = path.slice(path.lastIndexOf("."));
  const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(file), {
    contentType: MIME[ext],
    // Content-hashed files never change: cache for a year. The pointer must stay fresh.
    cacheControl: pointer ? "60" : "31536000",
    upsert: pointer,
  });
  if (error && /exists|Duplicate/i.test(error.message)) skipped++;
  else if (error) throw new Error(`${path}: ${error.message}`);
  else uploaded++;
}
console.log(`uploaded ${uploaded}, already present (immutable) ${skipped}`);
