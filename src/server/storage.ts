import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/env";

type Client = NonNullable<ServerSupabase>;

/**
 * Sign many private bicycle-media paths at once. Storage RLS decides access:
 * owners can sign their own media; anyone can sign media of PUBLIC bicycles.
 */
export async function signBicycleMedia(supabase: Client, paths: (string | null | undefined)[], expiresIn = 3600) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from("bicycle-media").createSignedUrls(unique, expiresIn);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  }
  return map;
}

export function avatarUrl(path: string | null | undefined): string | null {
  const env = getSupabaseEnv();
  if (!path || !env) return null;
  return `${env.url}/storage/v1/object/public/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}
