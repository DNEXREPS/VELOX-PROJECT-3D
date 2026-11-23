import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header (server only).
 * Secrets shorter than 32 characters are treated as not configured.
 */
export function isAuthorizedBearer(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const a = createHash("sha256").update(match[1]).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
