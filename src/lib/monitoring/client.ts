/**
 * Browser-side reporting for failures the server cannot see (3D loading, WebGL context
 * loss, client render errors). Sends a small, scrubbed beacon to our own origin; the
 * route handler validates it again and forwards it to the server-side monitoring sink.
 */
import { scrubPath, scrubString } from "./scrub";

export const CLIENT_ERROR_KINDS = ["3d-load", "webgl-context-lost", "render"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];
export const CLIENT_ERROR_ENDPOINT = "/api/monitoring/client-error";

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  model?: string;
  digest?: string;
  path?: string;
}

const sent = new Set<string>();

export function buildClientErrorReport(kind: ClientErrorKind, message: string, extra: { model?: string; digest?: string } = {}): ClientErrorReport {
  return {
    kind,
    message: scrubString(message || "Unknown error", 300),
    ...(extra.model ? { model: extra.model.slice(0, 64) } : {}),
    ...(extra.digest ? { digest: extra.digest.slice(0, 64) } : {}),
    ...(typeof location !== "undefined" ? { path: scrubPath(location.pathname) } : {}),
  };
}

/** Fire-and-forget; each distinct failure is reported at most once per page load. */
export function reportClientError(kind: ClientErrorKind, message: string, extra: { model?: string; digest?: string } = {}) {
  if (typeof window === "undefined") return;
  const report = buildClientErrorReport(kind, message, extra);
  const key = `${report.kind}|${report.message}|${report.model ?? ""}`;
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  try {
    const body = JSON.stringify(report);
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(CLIENT_ERROR_ENDPOINT, blob)) {
      void fetch(CLIENT_ERROR_ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never throw */
  }
}
