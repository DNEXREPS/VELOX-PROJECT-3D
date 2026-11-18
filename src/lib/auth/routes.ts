/**
 * Route access rules, shared by the proxy (redirects) and tests.
 * Server-side data access performs its own authorisation — this is only the
 * first line of defence and a UX convenience.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/garage", "/settings", "/moderation"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.includes(pathname);
}

/** Only allow same-origin relative redirects (prevents open redirects). */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const url = new URL(value, "http://velox.local");
    if (url.origin !== "http://velox.local") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
