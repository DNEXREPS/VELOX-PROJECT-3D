import { afterEach, describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { isAllowedImageUrl, parseImageHosts } from "@/lib/security/image-hosts";
import { isAuthorizedBearer } from "@/lib/security/bearer";
import { fromDbError, RATE_LIMIT_MESSAGE } from "@/lib/action-result";
import { setMonitoringSinks, type MonitoringEvent } from "@/lib/monitoring";
import { siteUrl } from "@/lib/env";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("Content Security Policy", () => {
  const base = { nonce: "abc123==", isDev: false, supabaseUrl: "https://proj.supabase.co" };

  it("uses a nonce + strict-dynamic for scripts and never allows unsafe-inline/eval in production", () => {
    const csp = buildCsp(base);
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123=='");
    expect(scripts).toContain("'strict-dynamic'");
    // Token-level checks: 'wasm-unsafe-eval' (WebAssembly only) is allowed, general eval is not.
    const tokens = scripts.split(" ").slice(1);
    expect(tokens).not.toContain("'unsafe-inline'");
    expect(tokens).not.toContain("'unsafe-eval'");
    expect(tokens).toContain("'wasm-unsafe-eval'");
    expect(directive(buildCsp({ ...base, isDev: true }), "script-src").split(" ")).toContain("'unsafe-eval'");
    expect(directive(buildCsp({ ...base, allowWasm: false }), "script-src").split(" ")).not.toContain("'wasm-unsafe-eval'");
  });

  it("locks down framing, plugins, base URI and form targets", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'self'");
  });

  it("allows only the Supabase origin and allow-listed hosts for images and connections", () => {
    const csp = buildCsp({ ...base, imageHosts: ["cdn.example.com"] });
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob: https://proj.supabase.co https://cdn.example.com");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co");
    expect(directive(buildCsp({ ...base, supabaseUrl: "not a url" }), "img-src")).toBe("img-src 'self' data: blob:");
  });

  it("only upgrades insecure requests when asked (HTTPS deployments)", () => {
    expect(buildCsp(base)).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ ...base, upgradeInsecureRequests: true })).toContain("upgrade-insecure-requests");
  });

  it("creates unpredictable base64 nonces", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("image host allow-list", () => {
  const hosts = parseImageHosts(" cdn.example.com,IMG.Example.org, bad host, http://x.com ,localhost");

  it("parses exact hostnames only", () => {
    expect(hosts).toEqual(["cdn.example.com", "img.example.org"]);
  });

  it("accepts relative paths, the Supabase project and allow-listed https hosts", () => {
    expect(isAllowedImageUrl("/images/a.jpg", hosts)).toBe(true);
    expect(isAllowedImageUrl("https://cdn.example.com/a.jpg", hosts)).toBe(true);
    expect(isAllowedImageUrl("https://proj.supabase.co/storage/v1/object/public/a.jpg", [], "https://proj.supabase.co")).toBe(true);
  });

  it("rejects other hosts, http, credentials, protocol-relative and script URLs", () => {
    for (const url of [
      "https://evil.example.net/a.jpg",
      "http://cdn.example.com/a.jpg",
      "https://user:pw@cdn.example.com/a.jpg",
      "//cdn.example.com/a.jpg",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "https://cdn.example.com.evil.net/a.jpg",
    ]) {
      expect(isAllowedImageUrl(url, hosts), url).toBe(false);
    }
  });
});

describe("cron bearer authentication", () => {
  const secret = "s".repeat(40);
  it("accepts only the exact configured secret", () => {
    expect(isAuthorizedBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedBearer(secret, secret)).toBe(false);
    expect(isAuthorizedBearer(null, secret)).toBe(false);
  });
  it("refuses everything when the secret is missing or too short", () => {
    expect(isAuthorizedBearer("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedBearer("Bearer short", "short")).toBe(false);
  });
});

describe("database error mapping & reporting", () => {
  let events: MonitoringEvent[] = [];
  const capture = () => {
    events = [];
    setMonitoringSinks([(e) => void events.push(e)]);
  };
  afterEach(() => setMonitoringSinks(null));

  it("maps the rate-limit SQLSTATE (PT429) to a friendly message and reports it as a security warning", async () => {
    capture();
    const r = fromDbError({ code: "PT429", message: "Rate limit exceeded for community_post" }, "x", "post.create");
    expect(r).toEqual({ ok: false, error: RATE_LIMIT_MESSAGE, fieldErrors: undefined });
    await Promise.resolve();
    expect(events).toEqual([expect.objectContaining({ level: "warning", area: "security", op: "post.create.rate_limited" })]);
  });

  it("does not report expected validation outcomes", async () => {
    capture();
    for (const code of ["23505", "23503", "23514", "PGRST116"]) fromDbError({ code, message: "x" });
    await Promise.resolve();
    expect(events).toHaveLength(0);
  });

  it("reports unexpected database errors without echoing row values", async () => {
    capture();
    const r = fromDbError({ code: "XX000", message: 'Failing row contains (WTU-SECRET-1, alice@example.com).' }, "Could not save.", "bike.update");
    expect(r.error).toBe("Could not save.");
    await Promise.resolve();
    expect(events[0]).toMatchObject({ level: "error", area: "db", op: "bike.update" });
    expect(JSON.stringify(events[0])).not.toMatch(/WTU-SECRET|alice@example/);
  });

  it("reports permission denials as security warnings", async () => {
    capture();
    fromDbError({ code: "42501", message: "permission denied for table bicycles" });
    await Promise.resolve();
    expect(events[0]).toMatchObject({ level: "warning", area: "security" });
  });
});

describe("site URL", () => {
  it("prefers the explicit site URL", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://staging.velox.example/", VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" })).toBe("https://staging.velox.example");
  });
  it("falls back to the stable branch URL on Vercel previews", () => {
    expect(siteUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "velox-git-feature.vercel.app", VERCEL_URL: "velox-abc123.vercel.app" })).toBe("https://velox-git-feature.vercel.app");
  });
  it("never guesses in production and defaults to localhost for local development", () => {
    expect(siteUrl({ VERCEL_ENV: "production", VERCEL_URL: "velox.vercel.app" })).toBe("http://localhost:3000");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});

describe("deployment configuration check", async () => {
  const { checkEnv } = await import("@/lib/env-check");
  const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
  const good = {
    NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
    NEXT_PUBLIC_SITE_URL: "https://velox.example",
    SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
    CRON_SECRET: "c".repeat(64),
    MONITORING_WEBHOOK_URL: "https://hooks.example/velox",
  };
  const errors = (env: Record<string, string | undefined>, target: "local" | "preview" | "production" = "production") =>
    checkEnv(env, target).filter((i) => i.level === "error").map((i) => i.variable);

  it("accepts a complete production configuration", () => {
    expect(checkEnv(good, "production")).toEqual([]);
  });
  it("catches a service-role key in the public anon variable", () => {
    expect(errors({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: good.SUPABASE_SERVICE_ROLE_KEY })).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(errors({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abc" })).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
  it("requires https URLs, a site URL in production and a strong cron secret", () => {
    expect(errors({ ...good, NEXT_PUBLIC_SITE_URL: undefined })).toContain("NEXT_PUBLIC_SITE_URL");
    expect(errors({ ...good, NEXT_PUBLIC_SITE_URL: "http://velox.example" })).toContain("NEXT_PUBLIC_SITE_URL");
    expect(errors({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://proj.supabase.co" })).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(errors({ ...good, CRON_SECRET: "short" })).toContain("CRON_SECRET");
    expect(errors({ ...good, CRON_SECRET: undefined })).toContain("CRON_SECRET");
  });
  it("rejects secrets with a NEXT_PUBLIC_ prefix and never echoes values", () => {
    const issues = checkEnv({ ...good, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_leak" }, "production");
    expect(issues.map((i) => i.variable)).toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(issues)).not.toContain("sb_secret_leak");
  });
  it("allows previews to rely on the Vercel branch URL", () => {
    expect(errors({ ...good, NEXT_PUBLIC_SITE_URL: undefined }, "preview")).toEqual([]);
  });
});
