import { safeRedirectPath } from "@/lib/auth/routes";

/**
 * Auth e-mail links (sign-up confirmation, password recovery, e-mail change) carry a
 * one-time `token_hash`. Corporate mail scanners (Safe Links, Defender, Proofpoint …)
 * fetch every link in a message with GET before the recipient clicks it, so the token
 * must NEVER be redeemed on GET. Links open /auth/confirm, which only renders a button;
 * the token is redeemed by a same-origin POST (Server Action) when the person presses it.
 */
export const EMAIL_LINK_TYPES = ["email", "recovery", "email_change"] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export interface EmailLink {
  tokenHash: string;
  type: EmailLinkType;
  next: string;
}

const TOKEN_HASH = /^[A-Za-z0-9_-]{16,256}$/;

export function parseEmailLink(input: { token_hash?: unknown; type?: unknown; next?: unknown }): EmailLink | null {
  const tokenHash = typeof input.token_hash === "string" ? input.token_hash : "";
  // "signup" is the legacy name of the "email" type; accept it from older links.
  const rawType = input.type === "signup" ? "email" : input.type;
  if (!TOKEN_HASH.test(tokenHash) || !EMAIL_LINK_TYPES.includes(rawType as EmailLinkType)) return null;
  const type = rawType as EmailLinkType;
  const fallback = type === "email_change" ? "/settings" : "/dashboard";
  return { tokenHash, type, next: safeRedirectPath(typeof input.next === "string" ? input.next : null, fallback) };
}

/** Where a successfully redeemed link continues to. */
export function destinationAfterConfirm(link: EmailLink): string {
  return link.type === "recovery" ? "/reset-password" : link.next;
}

/** URL of the confirmation page for a link (used to forward legacy callback links). */
export function confirmPagePath(link: EmailLink): string {
  const q = new URLSearchParams({ token_hash: link.tokenHash, type: link.type });
  if (link.type !== "recovery") q.set("next", link.next);
  return `/auth/confirm?${q.toString()}`;
}

export const EMAIL_LINK_COPY: Record<EmailLinkType, { title: string; description: string; action: string }> = {
  email: {
    title: "Confirm your e-mail address",
    description: "Press the button to confirm your address and open your garage.",
    action: "Confirm e-mail address",
  },
  recovery: {
    title: "Reset your password",
    description: "Press the button to continue. You will then choose a new password.",
    action: "Continue to reset password",
  },
  email_change: {
    title: "Confirm your new e-mail address",
    description: "Press the button to confirm the change of your account e-mail address.",
    action: "Confirm new e-mail address",
  },
};
