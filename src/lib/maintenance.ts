import type { MaintenanceType } from "@/lib/domain/bicycle";

/** Minimal shape needed for maintenance calculations (DB rows satisfy it). */
export interface MaintenanceLike {
  id: string;
  bicycle_id: string;
  slot: string | null;
  maintenance_type: MaintenanceType | string;
  title: string;
  performed_on: string;
  cost: number | string | null;
  currency: string | null;
  distance_km: number | string | null;
  next_due_on: string | null;
  next_due_distance_km: number | string | null;
  created_at?: string;
}

export type ReminderStatus = "overdue" | "due_soon" | "scheduled";

export interface Reminder<T extends MaintenanceLike = MaintenanceLike> {
  record: T;
  dueOn: string;
  daysUntil: number;
  status: ReminderStatus;
}

export const DUE_SOON_DAYS = 14;

function dayDiff(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Open reminders: records with a next_due_on that have NOT been superseded by a
 * later record of the same type for the same bicycle + slot.
 * `today` is an ISO date (YYYY-MM-DD) so the function is deterministic.
 */
export function computeReminders<T extends MaintenanceLike>(records: T[], today: string): Reminder<T>[] {
  const reminders: Reminder<T>[] = [];
  for (const r of records) {
    if (!r.next_due_on) continue;
    const superseded = records.some(
      (o) =>
        o.id !== r.id &&
        o.bicycle_id === r.bicycle_id &&
        o.maintenance_type === r.maintenance_type &&
        (o.slot ?? null) === (r.slot ?? null) &&
        (o.performed_on > r.performed_on ||
          (o.performed_on === r.performed_on && (o.created_at ?? "") > (r.created_at ?? ""))),
    );
    if (superseded) continue;
    const daysUntil = dayDiff(today, r.next_due_on);
    reminders.push({
      record: r,
      dueOn: r.next_due_on,
      daysUntil,
      status: daysUntil < 0 ? "overdue" : daysUntil <= DUE_SOON_DAYS ? "due_soon" : "scheduled",
    });
  }
  return reminders.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export interface CostSummary {
  /** Totals per currency — currencies are never mixed or converted. */
  byCurrency: Record<string, number>;
  byYear: { year: string; currency: string; total: number }[];
  byType: { type: string; currency: string; total: number; count: number }[];
  recordsWithCost: number;
  recordsWithoutCost: number;
}

export function costSummary(records: MaintenanceLike[]): CostSummary {
  const byCurrency: Record<string, number> = {};
  const year = new Map<string, number>();
  const type = new Map<string, { total: number; count: number }>();
  let withCost = 0;
  for (const r of records) {
    const cost = r.cost === null ? null : Number(r.cost);
    if (cost === null || !Number.isFinite(cost) || !r.currency) continue;
    withCost++;
    byCurrency[r.currency] = round2((byCurrency[r.currency] ?? 0) + cost);
    const yk = `${r.performed_on.slice(0, 4)}|${r.currency}`;
    year.set(yk, round2((year.get(yk) ?? 0) + cost));
    const tk = `${r.maintenance_type}|${r.currency}`;
    const t = type.get(tk) ?? { total: 0, count: 0 };
    t.total = round2(t.total + cost);
    t.count++;
    type.set(tk, t);
  }
  return {
    byCurrency,
    byYear: [...year.entries()].map(([k, total]) => ({ year: k.split("|")[0], currency: k.split("|")[1], total })).sort((a, b) => a.year.localeCompare(b.year)),
    byType: [...type.entries()].map(([k, v]) => ({ type: k.split("|")[0], currency: k.split("|")[1], ...v })).sort((a, b) => b.total - a.total),
    recordsWithCost: withCost,
    recordsWithoutCost: records.length - withCost,
  };
}

/** Latest recorded odometer reading across records (only what the rider entered). */
export function latestDistance(records: MaintenanceLike[]): { km: number; on: string } | null {
  let best: { km: number; on: string } | null = null;
  for (const r of records) {
    if (r.distance_km === null) continue;
    const km = Number(r.distance_km);
    if (!Number.isFinite(km)) continue;
    if (!best || r.performed_on > best.on || (r.performed_on === best.on && km > best.km)) best = { km, on: r.performed_on };
  }
  return best;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
