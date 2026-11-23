/**
 * Content Security Policy.
 *
 * Scripts: strict nonce + 'strict-dynamic' (a fresh nonce per request, set in proxy.ts;
 * Next.js applies it to its own scripts automatically). No inline event handlers, no eval
 * in production.
 *
 * Styles: 'unsafe-inline' is kept for style-src. React, Radix and Recharts render inline
 * `style` attributes, which nonces cannot cover; style injection is a much smaller risk
 * than script injection and script-src stays strict.
 *
 * Images: own origin, data/blob (GLB textures are decoded via blob: URLs), the Supabase
 * project (signed bicycle media + public avatars) and an explicit allow-list for external
 * component imagery.
 */
export interface CspOptions {
  nonce: string;
  isDev: boolean;
  supabaseUrl?: string | null;
  imageHosts?: string[];
  /** Only for HTTPS deployments; on http://localhost it would break same-origin assets. */
  upgradeInsecureRequests?: boolean;
  reportUri?: string | null;
}

function origin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp(opts: CspOptions): string {
  const supabase = origin(opts.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const imageHosts = (opts.imageHosts ?? []).map((h) => `https://${h}`);

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${opts.nonce}'`, "'strict-dynamic'", ...(opts.isDev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...(supabase ? [supabase] : []), ...imageHosts]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...(supabase ? [supabase, supabaseWs!] : []), ...(opts.isDev ? ["ws:"] : [])]],
    ["media-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`);
  if (opts.upgradeInsecureRequests) parts.push("upgrade-insecure-requests");
  if (opts.reportUri) parts.push(`report-uri ${opts.reportUri}`);
  return parts.join("; ");
}

/** 128 bits of randomness, base64 — Web Crypto works in both the Edge and Node runtimes. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
