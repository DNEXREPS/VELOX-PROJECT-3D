import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { isAuthPage, isProtectedPath } from "@/lib/auth/routes";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { imageHostsFromEnv } from "@/lib/security/image-hosts";

/**
 * Runs on every page/API request:
 *  1. Content Security Policy with a per-request nonce (Next.js reads the nonce from the
 *     request's CSP header and applies it to framework scripts).
 *  2. Supabase session refresh and route gating. Authorisation of data is still enforced
 *     server-side and by RLS (ADR-008).
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname, search } = request.nextUrl;

  const nonce = createNonce();
  // Lab only (VELOX_LABS=1): `?csp=no-wasm` simulates browsers that cannot compile
  // WebAssembly under CSP, to prove the JS-decoder / PNG fallbacks. Never in production.
  const labNoWasm = process.env.VELOX_LABS === "1" && pathname.startsWith("/lab/") && request.nextUrl.searchParams.get("csp") === "no-wasm";
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: url,
    imageHosts: imageHostsFromEnv(),
    upgradeInsecureRequests: request.nextUrl.protocol === "https:",
    allowWasm: !labNoWasm,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set("content-security-policy", csp);
    return res;
  };
  const next = () => NextResponse.next({ request: { headers: request.headers } });

  if (!url || !key) {
    // Backend not configured: protected pages render a configuration notice.
    return withCsp(next());
  }

  let response = next();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the JWT with Supabase Auth (do not trust getSession() here).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withCsp(NextResponse.redirect(login));
  }

  if (user && isAuthPage(pathname)) {
    const dash = request.nextUrl.clone();
    dash.pathname = "/dashboard";
    dash.search = "";
    return withCsp(NextResponse.redirect(dash));
  }

  return withCsp(response);
}

export const config = {
  // api/monitoring: anonymous beacons need no session; skipping the proxy means they can
  // never be used to generate Supabase Auth traffic.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|api/monitoring/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf)$).*)"],
};
