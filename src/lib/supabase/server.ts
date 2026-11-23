import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "@/lib/env";

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Supabase client bound to the current request's auth cookies.
 * Every query runs as the signed-in user (or anon) and is subject to RLS.
 * Returns null when Supabase is not configured.
 */
export async function createSupabaseServerClient() {
  // Read request data first: the render mode (and therefore nonce-based CSP) must not depend
  // on whether Supabase is configured. Otherwise unconfigured builds prerender pages as static
  // HTML without nonces, and 'strict-dynamic' blocks all their scripts.
  // See docs/security/csp-static-rendering.md.
  const cookieStore = await cookies();
  const env = getSupabaseEnv();
  if (!env) return null;
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by src/proxy.ts instead.
        }
      },
    },
  });
}
