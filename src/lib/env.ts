/**
 * Public runtime configuration. The app degrades gracefully when Supabase is not
 * configured: public pages render an explicit "backend not configured" state instead
 * of crashing, so UI development is not blocked by a missing project.
 */
export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes("your-project-ref")) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/**
 * Public origin used in auth e-mails and share links.
 * NEXT_PUBLIC_SITE_URL wins. On Vercel preview deployments without it, the branch URL
 * (stable per branch) is used so confirmation/reset links return to the same preview.
 * Production must always set NEXT_PUBLIC_SITE_URL explicitly.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
    if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}
