import { afterEach, describe, expect, it } from "vitest";
import { IntakeLimiter, type IntakeLimits } from "@/lib/monitoring/intake-limiter";
import { clientKey, handleClientErrorReport, MAX_BODY_BYTES } from "@/server/client-error-intake";
import { setMonitoringSinks, type MonitoringEvent } from "@/lib/monitoring";

const ORIGIN = "https://velox.example";
const limits: IntakeLimits = { perClient: 3, clientWindowMs: 60_000, dedupeWindowMs: 30_000, globalPerMinute: 5, maxTrackedKeys: 50 };

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("intake limiter", () => {
  it("allows a small number of reports per client, then limits that client only", () => {
    const c = clock();
    const l = new IntakeLimiter(limits, c.now);
    expect(["a", "b", "c"].map((m) => l.decide("client-1", m).action)).toEqual(["log", "log", "log"]);
    expect(l.decide("client-1", "d").action).toBe("client-limited");
    expect(l.decide("client-2", "e").action).toBe("log");
    c.advance(60_000);
    expect(l.decide("client-1", "f").action).toBe("log");
  });

  it("logs identical reports once per window and carries the repeat count forward", () => {
    const c = clock();
    const l = new IntakeLimiter(limits, c.now);
    expect(l.decide("k1", "same").action).toBe("log");
    expect(l.decide("k2", "same").action).toBe("duplicate");
    expect(l.decide("k3", "same").action).toBe("duplicate");
    c.advance(30_000);
    expect(l.decide("k4", "same")).toEqual({ action: "log", suppressedRepeats: 2 });
  });

  it("caps log lines per instance per minute and announces saturation once", () => {
    const c = clock();
    const l = new IntakeLimiter(limits, c.now);
    for (let i = 0; i < 5; i++) expect(l.decide(`c${i}`, `m${i}`).action).toBe("log");
    expect(l.decide("x1", "m-x1")).toEqual({ action: "saturated", announce: true, dropped: 1 });
    expect(l.decide("x2", "m-x2")).toMatchObject({ action: "saturated", announce: false });
    c.advance(60_000);
    expect(l.decide("x3", "m-x3").action).toBe("log");
  });

  it("keeps memory bounded under a flood of unique clients and messages", () => {
    const l = new IntakeLimiter(limits, clock().now);
    for (let i = 0; i < 10_000; i++) l.decide(`client-${i}`, `message-${i}`);
    expect(l.trackedKeys).toBeLessThanOrEqual(limits.maxTrackedKeys * 2);
  });
});

describe("client error intake endpoint", () => {
  let events: MonitoringEvent[] = [];
  afterEach(() => setMonitoringSinks(null));
  const capture = () => {
    events = [];
    setMonitoringSinks([(e) => void events.push(e)]);
  };
  const req = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/monitoring/client-error`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const valid = { kind: "3d-load", message: "GLB failed for rider@example.com", model: "velox-placeholder-road", path: "/garage/x?token=abc" };

  it("accepts a valid same-origin report and logs it scrubbed, without any client address", async () => {
    capture();
    const res = await handleClientErrorReport(req(valid), ORIGIN, new IntakeLimiter(limits));
    expect(res.status).toBe(204);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ area: "client-3d", op: "client.3d-load", tags: { model: "velox-placeholder-road", path: "/garage/x" } });
    const line = JSON.stringify(events[0]);
    expect(line).not.toMatch(/rider@example|203\.0\.113\.7|token=abc/);
  });

  it("rejects cross-site requests, wrong content types, oversized bodies and invalid payloads", async () => {
    capture();
    const l = new IntakeLimiter(limits);
    expect((await handleClientErrorReport(req(valid, { origin: "https://evil.example" }), ORIGIN, l)).status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: JSON.stringify(valid) });
    expect((await handleClientErrorReport(noOrigin, ORIGIN, l)).status).toBe(403);
    expect((await handleClientErrorReport(req(valid, { "content-type": "text/plain" }), ORIGIN, l)).status).toBe(415);
    expect((await handleClientErrorReport(req({ ...valid, message: "x".repeat(MAX_BODY_BYTES * 2) }), ORIGIN, l)).status).toBe(413);
    expect((await handleClientErrorReport(req("{not json"), ORIGIN, l)).status).toBe(400);
    for (const bad of [{ ...valid, kind: "shell" }, { ...valid, model: "../../etc" }, { ...valid, extra: "field" }, { ...valid, path: "https://evil.example" }, { kind: "render", message: "" }]) {
      expect((await handleClientErrorReport(req(bad), ORIGIN, l)).status).toBe(400);
    }
    expect(events).toHaveLength(0);
  });

  it("returns 429 to a flooding client and stops logging its reports", async () => {
    capture();
    const l = new IntakeLimiter(limits);
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await handleClientErrorReport(req({ ...valid, message: `failure ${i}` }), ORIGIN, l)).status);
    expect(statuses).toEqual([204, 204, 204, 429, 429, 429]);
    expect(events).toHaveLength(3);
  });

  it("derives an opaque, salted client key (no raw address, not stable across salts)", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    const a = clientKey(h, Buffer.from("salt-a"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
    expect(clientKey(h, Buffer.from("salt-b"))).not.toBe(a);
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7" }), Buffer.from("salt-a"))).toBe(a);
  });
});
