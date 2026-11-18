import type { Metadata } from "next";
import { SectionTitle } from "@/components/common/page-header";
import { Stat } from "@/components/common/data-value";
import { ProvenanceBadge } from "@/components/common/provenance";
import { WeightByGroupChart } from "@/features/analytics/charts";
import { GearTable } from "@/features/analytics/gear-table";
import { RevisionList } from "@/features/history/revision-list";
import { loadOwnedBike } from "@/server/bike-context";
import { getConfiguration, getRevisions } from "@/server/queries/garage";
import { componentCost, componentWeight, drivetrain, gearRange, gearTable, provenanceSummary, weightByGroup, wheelInfo } from "@/lib/analytics";
import { ATTRIBUTES } from "@/lib/compatibility/attributes";
import { SLOT_GROUPS } from "@/lib/domain/slots";
import { formatKg, formatMoney, formatMoneyMap, formatWeight, UNAVAILABLE } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { session, bike } = await loadOwnedBike(bikeId);
  const [parts, revisions] = await Promise.all([getConfiguration(session, bikeId), getRevisions(session, bikeId, 50)]);

  const weight = componentWeight(parts);
  const cost = componentCost(parts);
  const dt = drivetrain(parts);
  const wheels = wheelInfo(parts);
  const cells = gearTable(dt.chainrings, dt.cogs, wheels.circumferenceMm);
  const range = gearRange(cells);
  const groups = weightByGroup(parts).filter((g) => g.weightG > 0);
  const prov = provenanceSummary(parts);
  const groupLabel = Object.fromEntries(SLOT_GROUPS.map((g) => [g.id, g.label]));

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 sm:px-6">
      <section className="border border-border bg-surface p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          Every figure uses only recorded data. Labels show its origin: <ProvenanceBadge kind="user" /> entered by you, <ProvenanceBadge kind="calculated" /> derived from recorded values,{" "}
          <ProvenanceBadge kind="estimated" /> based on stated assumptions, <ProvenanceBadge kind="manufacturer_verified" /> from cited sources, <ProvenanceBadge kind="demo" /> sample data.
        </p>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <Stat label="Bicycle weight (measured)" value={bike.weight_kg ? formatKg(bike.weight_kg) : null} hint={bike.weight_kg ? <ProvenanceBadge kind="user" /> : "Enter it on the Edit page"} />
          <Stat
            label="Total component weight"
            value={weight.value !== null ? formatWeight(weight.value) : null}
            hint={
              weight.total === 0 ? "No components recorded" : (
                <span className="flex flex-wrap items-center gap-1">
                  <ProvenanceBadge kind="calculated" />
                  {!weight.complete && <span className="text-warning">{weight.known} of {weight.total} parts have a known weight — partial</span>}
                </span>
              )
            }
          />
          <Stat
            label="Total component cost"
            value={Object.keys(cost.paid).length || Object.keys(cost.reference).length ? formatMoneyMap(mergeMaps(cost.paid, cost.reference)) : null}
            hint={
              cost.totalParts === 0 ? undefined : (
                <span className="flex flex-col gap-0.5">
                  {Object.keys(cost.paid).length > 0 && <span>Paid: {formatMoneyMap(cost.paid)} <ProvenanceBadge kind="user" /></span>}
                  {Object.keys(cost.reference).length > 0 && <span>Reference: {formatMoneyMap(cost.reference)} <ProvenanceBadge kind="estimated" /></span>}
                  {cost.pricedParts < cost.totalParts && <span className="text-warning">{cost.totalParts - cost.pricedParts} parts without a price</span>}
                  {cost.mixedCurrency && <span className="text-warning">Multiple currencies — not converted</span>}
                </span>
              )
            }
          />
          <Stat label="Estimated bicycle value" value={bike.estimated_value ? formatMoney(bike.estimated_value, bike.value_currency) : null} hint={bike.estimated_value ? <ProvenanceBadge kind="user" /> : undefined} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>Drivetrain</SectionTitle>
          <dl className="divide-y divide-border border-y border-border text-sm">
            <Row label="Configuration" value={dt.label} hint={dt.label ? <ProvenanceBadge kind="calculated" /> : undefined} />
            <Row label="Chainrings" value={dt.chainrings.length ? `${dt.chainrings.join(" / ")} T` : null} hint={dt.chainrings.length ? <ProvenanceBadge kind={dt.source.chainrings ?? "custom"} /> : undefined} />
            <Row label="Cassette" value={dt.cogs.length ? `${dt.cogs[0]}–${dt.cogs[dt.cogs.length - 1]} T (${dt.cogs.length} cogs)` : null} hint={dt.cogs.length ? <ProvenanceBadge kind={dt.source.cogs ?? "custom"} /> : undefined} />
            <Row label="Gear range" value={range ? `${range.lowest.toFixed(2)} – ${range.highest.toFixed(2)} (${range.rangePercent}%)` : null} hint={range ? <ProvenanceBadge kind="calculated" /> : undefined} />
          </dl>
          {cells.length > 0 ? (
            <div className="mt-4">
              <GearTable cells={cells} chainrings={dt.chainrings} cogs={dt.cogs} showDevelopment={wheels.circumferenceMm !== null} />
              <p className="mt-2 text-xs text-muted-foreground">
                Gear ratio = chainring ÷ cog.{" "}
                {wheels.circumferenceMm
                  ? `Development (metres per crank revolution) uses an estimated rolling circumference of ${wheels.circumferenceMm} mm = π × (bead seat diameter + 2 × nominal tire width); real values vary with pressure and casing.`
                  : "Development is unavailable until a tire with wheel size and width is recorded."}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Gear ratios need chainring tooth counts (crankset spec “chainrings”) and cassette cogs (spec “cogs”).</p>
          )}
        </section>

        <section className="flex flex-col gap-8">
          <div>
            <SectionTitle>Wheels & tires</SectionTitle>
            <dl className="divide-y divide-border border-y border-border text-sm">
              <Row label="Wheel size" value={wheels.wheelSize ? ATTRIBUTES.wheel_size.values?.[wheels.wheelSize] ?? wheels.wheelSize : null} />
              <Row label="Front tire width" value={wheels.frontTireWidth ? `${wheels.frontTireWidth} mm (nominal)` : null} />
              <Row label="Rear tire width" value={wheels.rearTireWidth ? `${wheels.rearTireWidth} mm (nominal)` : null} />
              <Row label="Rolling circumference" value={wheels.circumferenceMm ? `≈ ${wheels.circumferenceMm} mm` : null} hint={wheels.circumferenceMm ? <ProvenanceBadge kind="estimated" /> : undefined} />
              {(() => {
                const ws = parts.find((p) => p.slot === "wheelset");
                const depth = ws?.specs.find((s) => s.key === "rim_depth");
                const width = ws?.specs.find((s) => s.key === "internal_width");
                return (
                  <>
                    <Row label="Rim depth" value={depth ? `${depth.value} ${depth.unit ?? ""}` : null} />
                    <Row label="Internal rim width" value={width ? `${width.value} ${width.unit ?? ""}` : null} />
                  </>
                );
              })()}
            </dl>
          </div>
          <div>
            <SectionTitle>Component distribution</SectionTitle>
            {groups.length ? (
              <WeightByGroupChart data={groups.map((g) => ({ label: groupLabel[g.group], weightG: g.weightG }))} />
            ) : (
              <p className="text-sm text-muted-foreground">No component weights recorded.</p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <Count label="Manufacturer verified" n={prov.manufacturer_verified} />
              <Count label="Community verified" n={prov.community_verified} />
              <Count label="User submitted" n={prov.user_submitted} />
              <Count label="Demo data" n={prov.demo} warn />
              <Count label="Custom parts" n={prov.custom} />
            </dl>
          </div>
        </section>
      </div>

      <section>
        <SectionTitle>Build history timeline</SectionTitle>
        {revisions.length ? <RevisionList revisions={revisions} max={10} /> : <p className="text-sm text-muted-foreground">No revisions yet.</p>}
      </section>
    </div>
  );
}

function mergeMaps(a: Record<string, number>, b: Record<string, number>) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2 text-right">
        <span className={value === null || value === undefined ? "italic text-subtle-foreground" : "figure"}>{value ?? UNAVAILABLE}</span>
        {hint}
      </dd>
    </div>
  );
}

function Count({ label, n, warn }: { label: string; n: number; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={warn && n ? "figure text-warning" : "figure"}>{n}</dd>
    </div>
  );
}
