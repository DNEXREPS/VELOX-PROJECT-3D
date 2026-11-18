import { describe, expect, it } from "vitest";
import { buildChanges, diffSnapshots, previewParts, type PendingMap } from "@/lib/configuration";
import type { CatalogComponent } from "@/types/domain";
import { part } from "../helpers";

const comp = (id: string, attrs = {}): CatalogComponent => ({
  id, slug: id, name: `Comp ${id}`, model: null, brandName: "Demo", brandSlug: "demo", categorySlug: "cassettes",
  categoryName: "Cassettes", slots: ["cassette"], weightG: 300, priceReference: 100, currency: "EUR", material: null,
  verification: "demo", specs: [], attributes: attrs,
});

describe("studio pending configuration", () => {
  const installed = [part("cassette", { componentId: "old" }), part("chain", { componentId: "chain-1" })];

  it("builds RPC changes only for real differences", () => {
    const pending: PendingMap = { cassette: { kind: "replace", component: comp("new") }, chain: { kind: "replace", component: comp("chain-1") } };
    expect(buildChanges(installed, pending)).toEqual([{ slot: "cassette", component_id: "new" }]);
  });

  it("emits removals only for installed slots and supports custom parts", () => {
    const pending: PendingMap = { saddle: { kind: "remove" }, chain: { kind: "remove" }, pedals: { kind: "custom", name: "Old flats" } };
    expect(buildChanges(installed, pending)).toEqual([
      { slot: "chain", remove: true },
      { slot: "pedals", component_id: null, custom_name: "Old flats" },
    ]);
  });

  it("previews the configuration with pending parts substituted", () => {
    const preview = previewParts(installed, { cassette: { kind: "replace", component: comp("new", { speeds: 11 }) }, chain: { kind: "remove" } });
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ slot: "cassette", name: "Comp new", attributes: { speeds: 11 } });
  });
});

describe("snapshot diff (mirror of SQL diff_configurations)", () => {
  it("classifies added, removed, replaced and updated slots", () => {
    const changes = diffSnapshots(
      { cassette: { component_id: "a", name: "A" }, chain: { component_id: "c", name: "C" }, saddle: { component_id: "s", name: "S", price_paid: 10 } },
      { cassette: { component_id: "b", name: "B" }, pedals: { component_id: "p", name: "P" }, saddle: { component_id: "s", name: "S", price_paid: 20 } },
    );
    expect(changes.map((c) => [c.slot, c.action])).toEqual([
      ["cassette", "replaced"],
      ["chain", "removed"],
      ["pedals", "added"],
      ["saddle", "updated"],
    ]);
  });

  it("returns no changes for identical snapshots", () => {
    expect(diffSnapshots({ a: { name: "x" } }, { a: { name: "x" } })).toEqual([]);
  });
});
