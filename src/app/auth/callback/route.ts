import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/routes";
import { confirmPagePath, parseEmailLink } from "@/lib/auth/email-link";

/**
 * OAuth / PKCE return URL (`code`). E-mail links with a one-time `token_hash` are NOT
 * redeemed here: a GET may come from a mail scanner pre-fetching the link. They are
 * forwarded to /auth/confirm, which redeems the token only on an explicit POST.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const code = searchParams.get("code");

  if (searchParams.has("token_hash")) {
    const link = parseEmailLink({ token_hash: searchParams.get("token_hash"), type: searchParams.get("type"), next: searchParams.get("next") });
    return NextResponse.redirect(`${origin}${link ? confirmPagePath(link) : "/login?error=callback"}`);
  }

  const supabase = await createSupabaseServerClient();
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}
