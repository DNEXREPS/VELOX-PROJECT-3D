import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { CLIENT_ERROR_KINDS } from "@/lib/monitoring/client";
import { captureMessage } from "@/lib/monitoring";
import { scrubPath, scrubString } from "@/lib/monitoring/scrub";
import { IntakeLimiter } from "@/lib/monitoring/intake-limiter";
import { MODELS } from "@/features/studio/models/registry";

/**
 * Anonymous intake for browser failure reports (3D loading, WebGL context loss, render
 * errors). Persists nothing. Defences, in order:
 *  1. browser same-origin signals (Origin / Sec-Fetch-Site) — stops cross-site abuse
 *     from other web pages; NOT a defence against scripts, which can forge headers
 *  2. JSON content type, 2 KB body cap, strict schema (known kinds and model keys only)
 *  3. IntakeLimiter: per-client, duplicate and per-instance budgets on log volume
 * Privacy: the client address is reduced to an HMAC with a random per-process salt,
 * kept only in memory for rate limiting, and never logged or stored.
 */
export const MAX_BODY_BYTES = 2048;

const MODEL_KEYS = Object.keys(MODELS) as [string, ...string[]];

export const clientReportSchema = z
  .object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    message: z.string().min(1).max(400),
    model: z.enum(MODEL_KEYS).optional(),
    digest: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    path: z.string().regex(/^\/[^\s]*$/).max(300).optional(),
  })
  .strict();

const SALT = randomBytes(32);
const defaultLimiter = new IntakeLimiter();

/** Opaque, unlinkable-across-restarts client key. Never logged. */
export function clientKey(headers: Headers, salt: Buffer = SALT): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return createHmac("sha256", salt).update(address).digest("hex").slice(0, 32);
}

function isSameOrigin(request: Request, origin: string): boolean {
  const header = request.headers.get("origin");
  if (header) return header === origin;
  const site = request.headers.get("sec-fetch-site");
  // sendBeacon from our own pages always carries Origin or Sec-Fetch-Site.
  return site === "same-origin";
}

export async function handleClientErrorReport(request: Request, origin: string, limiter: IntakeLimiter = defaultLimiter): Promise<Response> {
  if (!isSameOrigin(request, origin)) return new Response(null, { status: 403 });

  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return new Response(null, { status: 415 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return new Response(null, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = clientReportSchema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });

  const r = parsed.data;
  const message = scrubString(r.message, 300);
  const path = r.path ? scrubPath(r.path) : undefined;
  const decision = limiter.decide(clientKey(request.headers), `${r.kind}|${message}|${r.model ?? ""}|${path ?? ""}`);

  switch (decision.action) {
    case "client-limited":
      return new Response(null, { status: 429, headers: { "retry-after": "600" } });
    case "saturated":
      if (decision.announce) {
        await captureMessage("warning", "security", "client_report.saturated", "Client error intake budget exhausted on this instance; reports dropped", {
          dropped: decision.dropped,
        });
      }
      return new Response(null, { status: 429, headers: { "retry-after": "60" } });
    case "duplicate":
      return new Response(null, { status: 204 });
    case "log":
      await captureMessage(r.kind === "webgl-context-lost" ? "warning" : "error", r.kind === "render" ? "client" : "client-3d", `client.${r.kind}`, message, {
        model: r.model,
        digest: r.digest,
        path,
        repeats: decision.suppressedRepeats || undefined,
      });
      return new Response(null, { status: 204 });
  }
}

/** Read at most `max` bytes of the body; null when the body is larger (no unbounded buffering). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
