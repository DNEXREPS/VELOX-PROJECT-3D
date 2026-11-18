import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client. SERVER ONLY — used exclusively by the scheduled maintenance
 * route (/api/cron/storage-cleanup). Never import this from a page, component or
 * server action that runs on behalf of a user: it bypasses Row Level Security.
 * The `server-only` import makes any client-bundle import a build error.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-velox-client": "storage-cleanup-cron" } },
  });
}
