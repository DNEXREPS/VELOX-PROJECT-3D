/**
 * Redaction for anything that leaves the process as a log line or monitoring event.
 * Defence in depth: call sites should not pass private data in the first place, but
 * error messages from Postgres, Storage or third-party code can embed values.
 */

/** Keys whose values are never logged, whatever they contain. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|service[-_]?role|anon[-_]?key|serial|jwt|credential|e-?mail|phone|purchase|price|cost|private|notes?$|address|signature|code_verifier|refresh|access/i;

const MAX_STRING = 1000;
const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_KEYS = 40;

const STRING_RULES: [RegExp, string][] = [
  // JSON Web Tokens (Supabase access tokens, anon/service keys of the legacy format)
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[jwt]"],
  // New-format Supabase keys
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key]"],
  // Authorization headers
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]"],
  // Secrets carried in URLs (auth callbacks, signed storage URLs)
  [/([?&#](?:token|token_hash|code|access_token|refresh_token|apikey|key|signature|sig|password)=)[^&#\s"']*/gi, "$1[redacted]"],
  // Postgres detail fragments that echo row values, e.g. `Key (serial_number)=(WTU-123)` / `Failing row contains (...)`
  [/\)=\([^)]*\)/g, ")=([redacted])"],
  [/(Failing row contains )\(.*?\)(?=\.|$|\s)/g, "$1([redacted])"],
  // E-mail addresses
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // Postgres connection strings with credentials
  [/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[redacted]@"],
];

export function scrubString(input: string, max = MAX_STRING): string {
  let out = input;
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement);
  return out.length > max ? `${out.slice(0, max)}…[truncated]` : out;
}

/** Deep-copies a value with sensitive keys removed and strings scrubbed. */
export function scrub(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (depth >= MAX_DEPTH) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => scrub(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out;
  }
  return `[${typeof value}]`;
}

/** Request paths are logged without their query string (it can carry auth codes). */
export function scrubPath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "";
  return scrubString(clean, 300);
}

/** Keep stack frames, drop absolute local paths and anything that looks like a secret. */
export function scrubStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return scrubString(
    stack
      .split("\n")
      .slice(0, 12)
      .map((line) => line.replace(/\(?(?:file:\/\/)?\/[^\s)]*\/(node_modules|\.next|src)\//g, "($1/"))
      .join("\n"),
    4000,
  );
}
