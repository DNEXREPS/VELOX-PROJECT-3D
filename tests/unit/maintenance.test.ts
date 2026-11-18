import { describe, expect, it } from "vitest";
import { computeReminders, costSummary, latestDistance, type MaintenanceLike } from "@/lib/maintenance";

const rec = (o: Partial<MaintenanceLike> & { id: string }): MaintenanceLike => ({
  bicycle_id: "b1",
  slot: null,
  maintenance_type: "lubrication",
  title: "Lube chain",
  performed_on: "2026-01-01",
  cost: null,
  currency: null,
  distance_km: null,
  next_due_on: null,
  next_due_distance_km: null,
  ...o,
});

describe("maintenance reminders", () => {
  const today = "2026-06-15";

  it("classifies overdue, due soon and scheduled reminders", () => {
    const r = computeReminders(
      [
        rec({ id: "a", maintenance_type: "brake_bleed", next_due_on: "2026-06-01" }),
        rec({ id: "b", maintenance_type: "lubrication", next_due_on: "2026-06-20" }),
        rec({ id: "c", maintenance_type: "inspection", next_due_on: "2026-09-01" }),
      ],
      today,
    );
    expect(r.map((x) => [x.record.id, x.status, x.daysUntil])).toEqual([
      ["a", "overdue", -14],
      ["b", "due_soon", 5],
      ["c", "scheduled", 78],
    ]);
  });

  it("drops reminders superseded by a later record of the same type and slot", () => {
    const r = computeReminders(
      [
        rec({ id: "old", slot: "chain", performed_on: "2026-01-01", next_due_on: "2026-03-01" }),
        rec({ id: "new", slot: "chain", performed_on: "2026-03-02", next_due_on: "2026-05-01" }),
        rec({ id: "other-slot", slot: "cassette", performed_on: "2026-01-01", next_due_on: "2026-03-01" }),
      ],
      today,
    );
    expect(r.map((x) => x.record.id).sort()).toEqual(["new", "other-slot"]);
  });

  it("does not let another bicycle's record supersede", () => {
    const r = computeReminders(
      [rec({ id: "a", next_due_on: "2026-07-01" }), rec({ id: "b", bicycle_id: "b2", performed_on: "2026-05-01" })],
      today,
    );
    expect(r).toHaveLength(1);
  });

  it("ignores records without a due date", () => {
    expect(computeReminders([rec({ id: "a" })], today)).toEqual([]);
  });
});

describe("maintenance costs", () => {
  it("never mixes currencies and counts records without cost", () => {
    const s = costSummary([
      rec({ id: "1", cost: "40.50", currency: "EUR", performed_on: "2025-04-01", maintenance_type: "repair" }),
      rec({ id: "2", cost: 10, currency: "EUR", performed_on: "2026-02-01", maintenance_type: "repair" }),
      rec({ id: "3", cost: 25, currency: "USD", performed_on: "2026-02-01" }),
      rec({ id: "4" }),
    ]);
    expect(s.byCurrency).toEqual({ EUR: 50.5, USD: 25 });
    expect(s.recordsWithCost).toBe(3);
    expect(s.recordsWithoutCost).toBe(1);
    expect(s.byYear).toEqual([
      { year: "2025", currency: "EUR", total: 40.5 },
      { year: "2026", currency: "EUR", total: 10 },
      { year: "2026", currency: "USD", total: 25 },
    ]);
    expect(s.byType[0]).toEqual({ type: "repair", currency: "EUR", total: 50.5, count: 2 });
  });

  it("reports the latest rider-entered distance only", () => {
    expect(latestDistance([rec({ id: "1" })])).toBeNull();
    expect(latestDistance([rec({ id: "1", distance_km: 1200, performed_on: "2026-01-01" }), rec({ id: "2", distance_km: "1850.5", performed_on: "2026-03-01" })])).toEqual({ km: 1850.5, on: "2026-03-01" });
  });
});
