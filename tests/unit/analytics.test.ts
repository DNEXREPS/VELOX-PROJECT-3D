import { describe, expect, it } from "vitest";
import { componentCost, componentWeight, drivetrain, gearRange, gearTable, parseTeeth, provenanceSummary, weightByGroup, wheelInfo } from "@/lib/analytics";
import { part } from "../helpers";

describe("analytics", () => {
  it("returns null weight when no part has a known weight (no fabricated totals)", () => {
    const w = componentWeight([part("frame"), part("fork")]);
    expect(w.value).toBeNull();
    expect(w.known).toBe(0);
    expect(w.complete).toBe(false);
  });

  it("sums known weights and reports partial coverage", () => {
    const w = componentWeight([part("frame", { weightG: 980 }), part("fork", { weightG: 390 }), part("saddle")]);
    expect(w.value).toBe(1370);
    expect(w).toMatchObject({ known: 2, total: 3, complete: false });
  });

  it("excludes the groupset reference slot from physical totals", () => {
    const w = componentWeight([part("frame", { weightG: 1000 }), part("groupset", { weightG: 2500 })]);
    expect(w.value).toBe(1000);
    expect(w.total).toBe(1);
  });

  it("separates user-entered prices from catalogue reference prices, per currency", () => {
    const cost = componentCost([
      part("frame", { pricePaid: 1500, currency: "EUR", priceReference: 1900 }),
      part("fork", { priceReference: 400, currency: "EUR" }),
      part("saddle", { pricePaid: 90, currency: "USD" }),
      part("chain"),
    ]);
    expect(cost.paid).toEqual({ EUR: 1500, USD: 90 });
    expect(cost.reference).toEqual({ EUR: 400 });
    expect(cost.pricedParts).toBe(3);
    expect(cost.totalParts).toBe(4);
    expect(cost.mixedCurrency).toBe(true);
  });

  it("parses tooth counts defensively", () => {
    expect(parseTeeth("50,34")).toEqual([50, 34]);
    expect(parseTeeth("11-12-13")).toEqual([11, 12, 13]);
    expect(parseTeeth(40)).toEqual([40]);
    expect(parseTeeth("n/a")).toEqual([]);
    expect(parseTeeth(null)).toEqual([]);
    expect(parseTeeth("2, 400")).toEqual([]);
  });

  it("derives drivetrain configuration from specs only when available", () => {
    const d = drivetrain([
      part("crankset", { specs: [{ key: "chainrings", label: "Chainrings", value: "50,34", unit: "T", source: "demo" }] }),
      part("cassette", { attributes: { speeds: 12 }, specs: [{ key: "cogs", label: "Cogs", value: "11,12,13,14,15,17,19,21,24,27,30,34", unit: "T", source: "demo" }] }),
    ]);
    expect(d.label).toBe("2×12");
    expect(d.chainrings).toEqual([50, 34]);
    expect(d.cogs[0]).toBe(11);
    expect(drivetrain([part("crankset")]).label).toBeNull();
  });

  it("estimates wheel circumference only with wheel size AND tire width", () => {
    expect(wheelInfo([part("rear_tire", { attributes: { wheel_size: "700c", tire_width_mm: 28 } })]).circumferenceMm).toBe(Math.round(Math.PI * (622 + 56)));
    expect(wheelInfo([part("rear_tire", { attributes: { wheel_size: "700c" } })]).circumferenceMm).toBeNull();
  });

  it("computes gear ratios, development and range", () => {
    const cells = gearTable([50, 34], [11, 34], 2130);
    expect(cells).toHaveLength(4);
    expect(cells.find((c) => c.chainring === 50 && c.cog === 11)?.ratio).toBe(4.55);
    expect(cells.find((c) => c.chainring === 34 && c.cog === 34)?.ratio).toBe(1);
    expect(cells[0].developmentM).toBeCloseTo(9.68, 1);
    expect(gearRange(cells)).toEqual({ lowest: 1, highest: 4.55, rangePercent: 455 });
    expect(gearTable([50], [11], null)[0].developmentM).toBeNull();
    expect(gearRange([])).toBeNull();
  });

  it("groups weight by slot group and summarises provenance", () => {
    const parts = [
      part("frame", { weightG: 900, verification: "manufacturer_verified" }),
      part("fork", { weightG: 400, verification: "demo" }),
      part("chain", { weightG: 250, verification: "user_submitted" }),
      part("saddle", { custom: true, verification: null, componentId: null }),
    ];
    expect(weightByGroup(parts)[0]).toEqual({ group: "frameset", weightG: 1300, parts: 2 });
    expect(provenanceSummary(parts)).toEqual({ manufacturer_verified: 1, community_verified: 0, user_submitted: 1, demo: 1, custom: 1 });
  });
});
