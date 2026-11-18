import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { SectionTitle } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { CostByYearChart } from "@/features/analytics/charts";
import { MaintenanceDialog } from "@/features/maintenance/maintenance-form";
import { RecordActions } from "@/features/maintenance/record-actions";
import { ReminderList } from "@/features/maintenance/reminder-list";
import { ChangeLine } from "@/features/history/revision-list";
import { loadOwnedBike } from "@/server/bike-context";
import { getMaintenance, getMaintenancePhotos, getRevisions } from "@/server/queries/garage";
import { computeReminders, costSummary, latestDistance } from "@/lib/maintenance";
import { parseChanges } from "@/lib/configuration";
import { MAINTENANCE_TYPE_LABEL, type MaintenanceType } from "@/lib/domain/bicycle";
import { slotLabel } from "@/lib/domain/slots";
import { formatDate, formatMoney, formatMoneyMap, formatNumber, todayIso } from "@/lib/format";

export const metadata: Metadata = { title: "Maintenance" };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function MaintenancePage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { session, bike } = await loadOwnedBike(bikeId);
  const [records, revisions] = await Promise.all([getMaintenance(session, bikeId), getRevisions(session, bikeId, 100)]);
  const photos = await getMaintenancePhotos(session, records.map((r) => r.id));
  const reminders = computeReminders(records, todayIso());
  const costs = costSummary(records);
  const odometer = latestDistance(records);
  const replacements = revisions.flatMap((r) => parseChanges(r.changes).filter((c) => c.action !== "updated").map((c) => ({ ...c, at: r.created_at, rev: r.revision_number })));
  const currencies = Object.keys(costs.byCurrency);

  return (
    <div className="mx-auto grid grid-cols-1 max-w-[1440px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0">
        <SectionTitle action={<MaintenanceDialog bikeId={bike.id} />}>Maintenance timeline</SectionTitle>
        {records.length === 0 ? (
          <EmptyState icon={<Wrench />} title="No maintenance recorded" description="Log services, repairs and replacements as you do them. Set a next-due date to get reminders." />
        ) : (
          <ol className="relative flex flex-col gap-5 border-l border-border pl-5">
            {records.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-info" aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="figure text-foreground">{formatDate(r.performed_on)}</span>
                      <Badge>{MAINTENANCE_TYPE_LABEL[r.maintenance_type as MaintenanceType]}</Badge>
                      {r.slot && <span>{slotLabel(r.slot)}</span>}
                    </div>
                    <p className="mt-1 text-sm font-medium">{r.title}</p>
                    <p className="figure mt-0.5 text-xs text-muted-foreground">
                      {[r.distance_km !== null ? `${formatNumber(r.distance_km, "km")}` : null, r.cost !== null ? formatMoney(r.cost, r.currency) : null, r.next_due_on ? `next due ${formatDate(r.next_due_on)}` : null, r.next_due_distance_km !== null ? `next at ${formatNumber(r.next_due_distance_km, "km")}` : null]
                        .filter(Boolean)
                        .join(" · ") || "No distance or cost recorded"}
                    </p>
                    {r.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.notes}</p>}
                    {photos.get(r.id)?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {photos.get(r.id)!.map((p) =>
                          p.url ? (
                            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden border border-border">
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                              <img src={p.url} alt="Maintenance photo" className="size-full object-cover" loading="lazy" />
                            </a>
                          ) : null,
                        )}
                      </div>
                    ) : null}
                  </div>
                  <RecordActions
                    bikeId={bike.id}
                    recordId={r.id}
                    defaults={{
                      maintenance_type: r.maintenance_type, title: r.title, performed_on: r.performed_on, slot: s(r.slot), cost: s(r.cost),
                      currency: r.currency ?? "EUR", distance_km: s(r.distance_km), notes: s(r.notes), next_due_on: s(r.next_due_on), next_due_distance_km: s(r.next_due_distance_km),
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-8">
        <section>
          <SectionTitle>Upcoming</SectionTitle>
          {reminders.length ? <ReminderList reminders={reminders} /> : <p className="text-sm text-muted-foreground">No open reminders.</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Latest recorded odometer: <span className="figure text-foreground">{odometer ? `${formatNumber(odometer.km, "km")} (${formatDate(odometer.on)})` : "not recorded"}</span>. Distance-based reminders are shown on records; VELOX does not estimate mileage.
          </p>
        </section>

        <section>
          <SectionTitle>Service costs</SectionTitle>
          <p className="text-sm">
            Total: <span className="figure">{formatMoneyMap(costs.byCurrency)}</span>
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            {costs.recordsWithCost} records with cost · {costs.recordsWithoutCost} without{currencies.length > 1 ? " · currencies are not converted" : ""}
          </p>
          {currencies.map((cur) => (
            <div key={cur} className="mb-3">
              {currencies.length > 1 && <span className="eyebrow">{cur}</span>}
              <CostByYearChart currency={cur} data={costs.byYear.filter((y) => y.currency === cur)} />
            </div>
          ))}
          {costs.byType.length > 0 && (
            <ul className="divide-y divide-border border-y border-border text-sm">
              {costs.byType.map((t) => (
                <li key={`${t.type}-${t.currency}`} className="flex justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground">{MAINTENANCE_TYPE_LABEL[t.type as MaintenanceType] ?? t.type} <span className="figure text-xs">×{t.count}</span></span>
                  <span className="figure">{formatMoney(t.total, t.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Component replacement history</SectionTitle>
          {replacements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No component changes recorded.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {replacements.slice(0, 20).map((c, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <span className="figure text-[11px] text-subtle-foreground">{formatDate(c.at)} · rev {c.rev}</span>
                  <ul><ChangeLine change={c} /></ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
