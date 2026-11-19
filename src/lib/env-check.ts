/**
 * Deployment configuration checks (used by `npm run env:check`). Pure: never prints or
 * returns secret values, only variable names and problems.
 */
export type EnvTarget = "local" | "preview" | "production";
export interface EnvIssue {
  level: "error" | "warning";
  variable: string;
  message: string;
}

function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function httpsUrl(value: string | undefined): URL | null {
  try {
    const u = value ? new URL(value) : null;
    return u && u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function checkEnv(env: Record<string, string | undefined>, target: EnvTarget): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const err = (variable: string, message: string) => issues.push({ level: "error", variable, message });
  const warn = (variable: string, message: string) => issues.push({ level: "warning", variable, message });
  const hosted = target !== "local";

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.includes("your-project-ref")) err("NEXT_PUBLIC_SUPABASE_URL", "is not set");
  else if (hosted && !httpsUrl(url)) err("NEXT_PUBLIC_SUPABASE_URL", "must be an https URL for hosted deployments");

  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon || anon.startsWith("your-")) err("NEXT_PUBLIC_SUPABASE_ANON_KEY", "is not set");
  else if (anon.startsWith("sb_secret_") || jwtRole(anon) === "service_role" || anon === env.SUPABASE_SERVICE_ROLE_KEY) {
    err("NEXT_PUBLIC_SUPABASE_ANON_KEY", "contains a SERVICE ROLE key — this would expose full database access to every browser");
  }

  const site = env.NEXT_PUBLIC_SITE_URL;
  if (target === "production") {
    if (!site) err("NEXT_PUBLIC_SITE_URL", "is required in production (auth e-mail links)");
    else if (!httpsUrl(site)) err("NEXT_PUBLIC_SITE_URL", "must be an https URL in production");
  } else if (target === "preview" && site && !httpsUrl(site)) {
    err("NEXT_PUBLIC_SITE_URL", "must be an https URL (or unset to use the Vercel branch URL)");
  }

  for (const name of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(SERVICE|SECRET|PRIVATE|PASSWORD)/.test(name)) err(name, "secrets must never use the NEXT_PUBLIC_ prefix (it is sent to browsers)");
  }

  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const cron = env.CRON_SECRET;
  if (hosted) {
    if (!service) warn("SUPABASE_SERVICE_ROLE_KEY", "not set: scheduled storage cleanup is disabled (user-triggered cleanup still runs)");
    else if (!cron) err("CRON_SECRET", "is required when the cleanup cron is enabled");
  }
  if (cron && cron.length < 32) err("CRON_SECRET", "must be at least 32 characters");
  if (service && !service.startsWith("sb_secret_") && jwtRole(service) !== "service_role") {
    warn("SUPABASE_SERVICE_ROLE_KEY", "does not look like a service-role key");
  }

  const hook = env.MONITORING_WEBHOOK_URL;
  if (hook && !httpsUrl(hook)) err("MONITORING_WEBHOOK_URL", "must be an https URL");
  if (hosted && !hook) warn("MONITORING_WEBHOOK_URL", "not set: errors go to Vercel logs only (configure a Log Drain or this webhook for alerting)");

  return issues;
}
