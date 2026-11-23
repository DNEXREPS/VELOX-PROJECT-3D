import { afterEach, describe, expect, it } from "vitest";
import { scrub, scrubPath, scrubStack, scrubString } from "@/lib/monitoring/scrub";
import { captureError, captureMessage, setMonitoringSinks, type MonitoringEvent } from "@/lib/monitoring";
import { buildClientErrorReport } from "@/lib/monitoring/client";

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("scrubbing", () => {
  it("removes tokens, keys, e-mail addresses and secrets in URLs", () => {
    const s = scrubString(
      `token ${JWT} key sb_secret_abc123 Bearer abc.def mail rider@example.com url /auth/callback?code=123&next=/x&token_hash=zzz postgres://u:pw@db:5432/x`,
    );
    expect(s).not.toContain(JWT);
    expect(s).not.toContain("sb_secret_abc123");
    expect(s).not.toContain("abc.def");
    expect(s).not.toContain("rider@example.com");
    expect(s).not.toContain("code=123");
    expect(s).not.toContain("zzz");
    expect(s).not.toContain("u:pw");
    expect(s).toContain("next=/x");
  });

  it("removes values echoed by Postgres error details", () => {
    expect(scrubString("Key (serial_number)=(WTU-123) already exists.")).toBe("Key (serial_number)=([redacted]) already exists.");
    expect(scrubString("Failing row contains (abc, 4200, secret).")).not.toContain("secret");
  });

  it("redacts sensitive keys at any depth and bounds size", () => {
    const out = scrub({
      bikeId: "b1",
      serial_number: "WTU-1",
      nested: { password: "x", purchase_price: 10, Authorization: "Bearer y", notes: "private", ok: "yes" },
      list: Array.from({ length: 50 }, (_, i) => i),
      long: "a".repeat(5000),
    }) as Record<string, unknown>;
    expect(out.bikeId).toBe("b1");
    expect(out.serial_number).toBe("[redacted]");
    expect(out.nested).toEqual({ password: "[redacted]", purchase_price: "[redacted]", Authorization: "[redacted]", notes: "[redacted]", ok: "yes" });
    expect((out.list as unknown[]).length).toBe(20);
    expect((out.long as string).length).toBeLessThan(1100);
  });

  it("drops query strings from paths and local directories from stacks", () => {
    expect(scrubPath("/auth/callback?token_hash=abc&type=recovery")).toBe("/auth/callback");
    expect(scrubStack("Error: x\n    at f (/home/user/app/src/server/a.ts:1:1)")).toContain("(src/server/a.ts:1:1)");
  });
});

describe("capture", () => {
  let events: MonitoringEvent[] = [];
  afterEach(() => setMonitoringSinks(null));

  it("emits one structured, scrubbed event per capture and never throws when a sink fails", async () => {
    events = [];
    setMonitoringSinks([
      (e) => void events.push(e),
      () => {
        throw new Error("sink down");
      },
    ]);
    const err = Object.assign(new Error(`upload failed for rider@example.com with ${JWT}`), { code: "StorageApiError" });
    await captureError(err, { area: "storage", op: "bicycle_image.upload", tags: { bucket: "bicycle-media", serial: "WTU-1" } });
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e).toMatchObject({ source: "velox", level: "error", area: "storage", op: "bicycle_image.upload", error: { name: "Error", code: "StorageApiError" } });
    expect(e.tags).toEqual({ bucket: "bicycle-media", serial: "[redacted]" });
    expect(JSON.stringify(e)).not.toMatch(/rider@example|eyJhbGci/);
  });

  it("captures plain error objects (Supabase errors) and messages", async () => {
    events = [];
    setMonitoringSinks([(e) => void events.push(e)]);
    await captureError({ message: "relation does not exist", code: "42P01" }, { area: "db", op: "q" });
    await captureMessage("warning", "security", "denied", "Permission denied");
    expect(events.map((e) => [e.level, e.error?.code ?? null])).toEqual([
      ["error", "42P01"],
      ["warning", null],
    ]);
  });
});

describe("client error reports", () => {
  it("are small, typed and scrubbed before leaving the browser", () => {
    const r = buildClientErrorReport("3d-load", `Could not load /models/x.glb?token=${JWT} for rider@example.com ${"x".repeat(1000)}`, { model: "velox-placeholder-road" });
    expect(r.kind).toBe("3d-load");
    expect(r.model).toBe("velox-placeholder-road");
    expect(r.message.length).toBeLessThanOrEqual(320);
    expect(r.message).not.toMatch(/eyJhbGci|rider@example/);
  });
});
