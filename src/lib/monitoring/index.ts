/**
 * Vendor-neutral error monitoring.
 *
 * Every event is scrubbed (see ./scrub.ts) and written as ONE structured JSON line to
 * stderr. On Vercel these lines are searchable in the Logs UI and can be forwarded to
 * any provider (Sentry, Axiom, Datadog, Better Stack …) with a Log Drain, without adding
 * an SDK to the bundle. Optionally, MONITORING_WEBHOOK_URL receives the same JSON payload
 * (server only; e.g. an ingestion endpoint or an alerting relay).
 *
 * Never pass request bodies, form data, cookies or rows containing private columns.
 * Pass identifiers and operation names; the scrubber is a safety net, not a filter.
 */
import { scrub, scrubStack, scrubString } from "./scrub";

export type MonitoringArea = "server" | "action" | "db" | "storage" | "client-3d" | "client" | "cron" | "auth" | "security";
export type MonitoringLevel = "error" | "warning" | "info";
export type MonitoringTags = Record<string, string | number | boolean | null | undefined>;

export interface MonitoringEvent {
  source: "velox";
  ts: string;
  level: MonitoringLevel;
  area: MonitoringArea;
  op: string;
  message: string;
  error?: { name?: string; code?: string; digest?: string; stack?: string };
  tags?: Record<string, unknown>;
  env?: string;
  release?: string;
}

export type MonitoringSink = (event: MonitoringEvent) => void | Promise<void>;

interface CaptureContext {
  area: MonitoringArea;
  op: string;
  level?: MonitoringLevel;
  tags?: MonitoringTags;
}

const consoleSink: MonitoringSink = (event) => {
  const line = JSON.stringify(event);
  if (event.level === "error") console.error(line);
  else if (event.level === "warning") console.warn(line);
  else console.info(line);
};

const webhookSink: MonitoringSink = async (event) => {
  const url = typeof window === "undefined" ? process.env.MONITORING_WEBHOOK_URL : undefined;
  if (!url) return;
  const token = process.env.MONITORING_WEBHOOK_TOKEN;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(2000),
  });
};

const defaultSinks: MonitoringSink[] = [consoleSink, webhookSink];
let sinks: MonitoringSink[] = defaultSinks;

/** Test hook / integration point (e.g. to add an SDK-based sink). */
export function setMonitoringSinks(next: MonitoringSink[] | null) {
  sinks = next ?? defaultSinks;
}

function buildEvent(level: MonitoringLevel, area: MonitoringArea, op: string, message: string, error?: MonitoringEvent["error"], tags?: MonitoringTags): MonitoringEvent {
  return {
    source: "velox",
    ts: new Date().toISOString(),
    level,
    area,
    op: scrubString(op, 120),
    message: scrubString(message),
    ...(error ? { error } : {}),
    ...(tags ? { tags: scrub(tags) as Record<string, unknown> } : {}),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
  };
}

async function emit(event: MonitoringEvent) {
  await Promise.all(
    sinks.map(async (sink) => {
      try {
        await sink(event);
      } catch {
        // Monitoring must never break the request that is being monitored.
      }
    }),
  );
}

function describe(err: unknown): { message: string; error: NonNullable<MonitoringEvent["error"]> } {
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown; digest?: unknown };
    return {
      message: err.message || err.name,
      error: {
        name: err.name,
        code: typeof e.code === "string" ? e.code : undefined,
        digest: typeof e.digest === "string" ? e.digest : undefined,
        stack: scrubStack(err.stack),
      },
    };
  }
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown; name?: unknown; statusCode?: unknown };
    return {
      message: typeof o.message === "string" ? o.message : "Unknown error object",
      error: {
        name: typeof o.name === "string" ? o.name : undefined,
        code: typeof o.code === "string" ? o.code : typeof o.statusCode === "string" ? o.statusCode : undefined,
      },
    };
  }
  return { message: typeof err === "string" ? err : "Unknown error", error: {} };
}

/** Report an error. Returns a promise so serverless call sites can await delivery. */
export function captureError(err: unknown, ctx: CaptureContext): Promise<void> {
  const { message, error } = describe(err);
  return emit(buildEvent(ctx.level ?? "error", ctx.area, ctx.op, message, error, ctx.tags));
}

/** Report a notable condition that is not an exception (rate-limit hits, denied actions …). */
export function captureMessage(level: MonitoringLevel, area: MonitoringArea, op: string, message: string, tags?: MonitoringTags): Promise<void> {
  return emit(buildEvent(level, area, op, message, undefined, tags));
}
