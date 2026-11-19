import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { confirmEmailLink } from "@/server/actions/auth";
import { EMAIL_LINK_COPY, parseEmailLink } from "@/lib/auth/email-link";

export const metadata: Metadata = {
  title: "Confirm",
  robots: { index: false, follow: false },
  // The one-time token is in this page's URL: never send it as a Referer.
  referrer: "no-referrer",
};

/**
 * Landing page for auth e-mail links. Rendering it (GET) never redeems the token, so
 * mail scanners that pre-fetch links cannot consume it; the button submits a POST.
 */
export default async function ConfirmEmailLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const link = parseEmailLink({ token_hash: first(params.token_hash), type: first(params.type), next: first(params.next) });

  if (!link) {
    return (
      <AuthShell title="Link not valid" description="This link is incomplete or malformed.">
        <p className="text-sm text-muted-foreground">
          Request a new link from the{" "}
          <Link href="/forgot-password" className="text-accent hover:underline">password reset page</Link> or{" "}
          <Link href="/login" className="text-accent hover:underline">sign in</Link>.
        </p>
      </AuthShell>
    );
  }

  const copy = EMAIL_LINK_COPY[link.type];
  return (
    <AuthShell title={copy.title} description={copy.description}>
      <form action={confirmEmailLink} className="flex flex-col gap-3">
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        <input type="hidden" name="next" value={link.next} />
        <Button type="submit" variant="primary">{copy.action}</Button>
        <p className="text-xs text-muted-foreground">Links work once and expire after one hour.</p>
      </form>
    </AuthShell>
  );
}
