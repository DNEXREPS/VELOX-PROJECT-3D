export const UNAVAILABLE = "Unavailable";

export function formatMoney(value: number | string | null | undefined, currency: string | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || value === "" || !currency) return UNAVAILABLE;
  const n = Number(value);
  if (!Number.isFinite(n)) return UNAVAILABLE;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact || n >= 1000 ? 0 : 2,
    notation: opts.compact && n >= 10000 ? "compact" : "standard",
  }).format(n);
}

export function formatMoneyMap(map: Record<string, number>): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return UNAVAILABLE;
  return entries.map(([cur, v]) => formatMoney(v, cur)).join(" + ");
}

export function formatWeight(grams: number | string | null | undefined): string {
  if (grams === null || grams === undefined || grams === "") return UNAVAILABLE;
  const g = Number(grams);
  if (!Number.isFinite(g)) return UNAVAILABLE;
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}

export function formatKg(kg: number | string | null | undefined): string {
  if (kg === null || kg === undefined || kg === "") return UNAVAILABLE;
  const n = Number(kg);
  return Number.isFinite(n) ? `${n.toFixed(2)} kg` : UNAVAILABLE;
}

export function formatNumber(value: number | string | null | undefined, unit?: string | null, digits = 1): string {
  if (value === null || value === undefined || value === "") return UNAVAILABLE;
  const n = Number(value);
  if (!Number.isFinite(n)) return UNAVAILABLE;
  const s = Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: digits });
  return unit ? `${s} ${unit}` : s;
}

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!value) return UNAVAILABLE;
  const d = value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return UNAVAILABLE;
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d);
}

export function relativeTime(value: string, now = Date.now()): string {
  const diff = (new Date(value).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(value);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function initials(name: string | null | undefined): string {
  return (name ?? "?")
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
