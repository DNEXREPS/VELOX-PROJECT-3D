/**
 * External image hosts allowed for component imagery (catalogue data can contain image
 * URLs submitted by riders). Configured with IMAGE_HOSTS_ALLOWLIST, a comma-separated
 * list of exact hostnames. Anything else is not rendered and is blocked by the CSP.
 */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function parseImageHosts(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter((h) => HOSTNAME.test(h)),
    ),
  ];
}

export function imageHostsFromEnv(): string[] {
  return parseImageHosts(process.env.IMAGE_HOSTS_ALLOWLIST);
}

/** Site-relative paths, the Supabase project, and allow-listed https hosts only. */
export function isAllowedImageUrl(url: string, hosts: string[], supabaseUrl?: string | null): boolean {
  if (/^\/[^/\\]/.test(url)) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (supabaseUrl) {
    try {
      if (parsed.origin === new URL(supabaseUrl).origin) return true;
    } catch {
      /* ignore */
    }
  }
  return hosts.includes(parsed.hostname.toLowerCase());
}
