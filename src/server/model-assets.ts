import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trusted reference to the immutable 3D asset manifest. The server computes the SHA-256
 * of the deployed manifest pointer; clients fetch `manifest-<sha12>.json` from the asset
 * base URL and verify it before trusting any asset entry.
 * Base URL: NEXT_PUBLIC_MODEL_ASSETS_URL (e.g. the public Supabase bucket) or /model-assets/.
 */
export const getModelManifestRef = cache((): { baseUrl: string; file: string; sha256: string } | null => {
  try {
    const pointer = readFileSync(join(process.cwd(), "public", "model-assets", "manifest.json"));
    const sha256 = createHash("sha256").update(pointer).digest("hex");
    const configured = process.env.NEXT_PUBLIC_MODEL_ASSETS_URL?.trim();
    const baseUrl = configured ? (configured.endsWith("/") ? configured : `${configured}/`) : "/model-assets/";
    return { baseUrl, file: `manifest-${sha256.slice(0, 12)}.json`, sha256 };
  } catch {
    return null;
  }
});
