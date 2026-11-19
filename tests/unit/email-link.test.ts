import { describe, expect, it } from "vitest";
import { confirmPagePath, destinationAfterConfirm, parseEmailLink } from "@/lib/auth/email-link";
import { requireDatabaseUrl } from "../db/database-url";

const HASH = "e3f6dda291a44bcc35284930dbccffe2c1809d9c3155f2a8a4b1c2d3";

describe("auth e-mail links", () => {
  it("accepts the three supported link types and maps legacy 'signup' to 'email'", () => {
    expect(parseEmailLink({ token_hash: HASH, type: "recovery" })).toEqual({ tokenHash: HASH, type: "recovery", next: "/dashboard" });
    expect(parseEmailLink({ token_hash: HASH, type: "signup", next: "/garage" })).toMatchObject({ type: "email", next: "/garage" });
    expect(parseEmailLink({ token_hash: HASH, type: "email_change" })).toMatchObject({ next: "/settings" });
  });

  it("rejects malformed tokens and unsupported types", () => {
    for (const input of [
      { token_hash: "", type: "recovery" },
      { token_hash: "short", type: "recovery" },
      { token_hash: `${HASH}<script>`, type: "recovery" },
      { token_hash: HASH, type: "magiclink" },
      { token_hash: HASH, type: undefined },
      { token_hash: ["a"], type: "email" },
    ]) {
      expect(parseEmailLink(input as never)).toBeNull();
    }
  });

  it("never redirects off-site after confirmation", () => {
    expect(parseEmailLink({ token_hash: HASH, type: "email", next: "https://evil.example" })?.next).toBe("/dashboard");
    expect(parseEmailLink({ token_hash: HASH, type: "email", next: "//evil.example" })?.next).toBe("/dashboard");
  });

  it("recovery always continues to the password form; legacy links are forwarded to the confirm page", () => {
    const rec = parseEmailLink({ token_hash: HASH, type: "recovery", next: "/garage" })!;
    expect(destinationAfterConfirm(rec)).toBe("/reset-password");
    expect(confirmPagePath(rec)).toBe(`/auth/confirm?token_hash=${HASH}&type=recovery`);
    const conf = parseEmailLink({ token_hash: HASH, type: "email", next: "/garage" })!;
    expect(confirmPagePath(conf)).toBe(`/auth/confirm?token_hash=${HASH}&type=email&next=%2Fgarage`);
  });
});

describe("database suite guard", () => {
  it("fails closed without DATABASE_URL and rejects non-Postgres URLs", () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "  " })).toThrow(/not set/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "mysql://x" })).toThrow(/postgres/);
    expect(requireDatabaseUrl({ DATABASE_URL: "postgresql://u@h:5432/db" })).toBe("postgresql://u@h:5432/db");
  });
});
