/**
 * Abuse protection for the anonymous client-error intake (`/api/monitoring/client-error`).
 *
 * The endpoint persists nothing; its only cost to an attacker's target is log volume.
 * This limiter bounds that volume per server instance:
 *
 *  - per client:      at most `perClient` reports per window (key = salted hash of the
 *                     client address, computed by the caller; never logged or stored)
 *  - per fingerprint: identical reports (kind + message + model + path) are logged once
 *                     per window; repeats are counted and reported with the next entry
 *  - global:          at most `globalPerMinute` logged reports per instance per minute;
 *                     the excess is dropped and summarised in one saturation warning
 *
 * All maps are size-capped, so memory stays bounded under a flood of unique keys.
 * State is per instance (serverless): for a hard cross-instance limit, add a platform
 * rate-limit rule (Vercel Firewall) for this path — see docs/deployment/staging.md.
 */
export interface IntakeLimits {
  perClient: number;
  clientWindowMs: number;
  dedupeWindowMs: number;
  globalPerMinute: number;
  maxTrackedKeys: number;
}

export const DEFAULT_INTAKE_LIMITS: IntakeLimits = {
  perClient: 10,
  clientWindowMs: 10 * 60_000,
  dedupeWindowMs: 5 * 60_000,
  globalPerMinute: 60,
  maxTrackedKeys: 5000,
};

export type IntakeDecision =
  | { action: "log"; suppressedRepeats: number }
  | { action: "duplicate" }
  | { action: "client-limited" }
  | { action: "saturated"; announce: boolean; dropped: number };

interface Window {
  start: number;
  count: number;
}

export class IntakeLimiter {
  private clients = new Map<string, Window>();
  private fingerprints = new Map<string, Window & { suppressed: number }>();
  private globalWindow: Window = { start: 0, count: 0 };
  private dropped = 0;
  private announced = false;

  constructor(
    private readonly limits: IntakeLimits = DEFAULT_INTAKE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  decide(clientKey: string, fingerprint: string): IntakeDecision {
    const t = this.now();

    // 1. Per-client limit (counts every request, including duplicates).
    const client = this.window(this.clients, clientKey, this.limits.clientWindowMs, t);
    client.count++;
    if (client.count > this.limits.perClient) return { action: "client-limited" };

    // 2. Identical reports: log once per window, count the rest.
    const existing = this.fingerprints.get(fingerprint);
    if (existing && t - existing.start < this.limits.dedupeWindowMs) {
      existing.suppressed++;
      return { action: "duplicate" };
    }
    const suppressedRepeats = existing?.suppressed ?? 0;

    // 3. Global per-instance budget for log lines.
    if (t - this.globalWindow.start >= 60_000) {
      this.globalWindow = { start: t, count: 0 };
      this.announced = false;
    }
    if (this.globalWindow.count >= this.limits.globalPerMinute) {
      this.dropped++;
      const announce = !this.announced;
      this.announced = true;
      const dropped = this.dropped;
      if (announce) this.dropped = 0;
      return { action: "saturated", announce, dropped };
    }
    this.globalWindow.count++;
    this.remember(this.fingerprints, fingerprint, { start: t, count: 1, suppressed: 0 });
    return { action: "log", suppressedRepeats };
  }

  /** For tests/diagnostics: number of tracked keys (bounded by maxTrackedKeys). */
  get trackedKeys() {
    return this.clients.size + this.fingerprints.size;
  }

  private window(map: Map<string, Window>, key: string, windowMs: number, t: number): Window {
    const w = map.get(key);
    if (w && t - w.start < windowMs) return w;
    const fresh = { start: t, count: 0 };
    this.remember(map, key, fresh);
    return fresh;
  }

  private remember<V>(map: Map<string, V>, key: string, value: V) {
    map.delete(key);
    map.set(key, value);
    // Maps iterate in insertion order: evict the oldest entries beyond the cap.
    while (map.size > this.limits.maxTrackedKeys) {
      const oldest = map.keys().next().value as string;
      map.delete(oldest);
    }
  }
}
