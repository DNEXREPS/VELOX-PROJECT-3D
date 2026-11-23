/**
 * CI guard: fail the build when an HTML page is prerendered as static while the
 * proxy serves it a nonce-based CSP. Static HTML has no nonce, so every script would be
 * blocked ('strict-dynamic' ignores 'self'). Routes may be static only if listed in
 * STATIC_CSP_ROUTES with their own non-nonce policy (none today).
 *
 *   npm run build && npm run check:static-routes
 */
import { existsSync, readFileSync } from "node:fs";

const STATIC_CSP_ROUTES = new Set([]); // e.g. future SEO catalogue pages with a hash/SRI policy
const NON_HTML = /^\/(_global-error|favicon\.ico|robots\.txt|sitemap\.xml|manifest\.webmanifest)$|\.(ico|png|svg|txt|xml|json|webmanifest)$/;

if (!existsSync(".next/prerender-manifest.json")) {
  console.error("No .next/prerender-manifest.json — run `npm run build` first.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(".next/prerender-manifest.json", "utf8"));
const offenders = Object.keys(manifest.routes).filter((r) => !NON_HTML.test(r) && !STATIC_CSP_ROUTES.has(r));
if (offenders.length) {
  console.error(`Static HTML routes would be served a nonce CSP they cannot satisfy:\n  ${offenders.join("\n  ")}`);
  process.exit(1);
}
console.log(`OK: no static HTML routes outside the allowlist (${Object.keys(manifest.routes).length} prerendered entries checked).`);
