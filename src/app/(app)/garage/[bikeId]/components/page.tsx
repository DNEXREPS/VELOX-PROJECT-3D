import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleHelp, Plus, XCircle } from "lucide-react";
import { SectionTitle } from "@/components/common/page-header";
import { ProvenanceBadge } from "@/components/common/provenance";
import { DataValue } from "@/components/common/data-value";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { PartActions } from "@/features/components/part-actions";
import { loadOwnedBike } from "@/server/bike-context";
import { getConfiguration } from "@/server/queries/garage";
import { checkConfiguration } from "@/lib/compatibility";
import { toPartRef } from "@/lib/configuration";
import { BIKE_SLOTS, SLOT_META } from "@/lib/domain/slots";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";

export const metadata: Metadata = { title: "Components" };

export default async function BikeComponentsPage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { session, bike } = await loadOwnedBike(bikeId);
  const parts = await getConfiguration(session, bikeId);
  const ordered = BIKE_SLOTS.flatMap((s) => parts.filter((p) => p.slot === s));
  const checks = checkConfiguration(parts.map(toPartRef));
  const bad = checks.filter((c) => c.status === "incompatible");
  const unknown = checks.filter((c) => c.status === "unknown");

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 sm:px-6">
      <section>
        <SectionTitle action={<Button asChild size="sm" variant="primary"><Link href={`/garage/${bike.id}/studio`}><Plus /> Add or replace in Studio</Link></Button>}>
          Installed components
        </SectionTitle>
        {ordered.length === 0 ? (
          <EmptyState title="No components recorded" description="Use the 3D Studio to select each position and choose parts from the registry." />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:text-muted-foreground">
                    <th>Position</th><th>Component</th><th>Data</th><th className="text-right">Weight</th><th className="text-right">Price paid</th><th className="text-right">Ref. price</th><th>Installed</th><th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ordered.map((p) => (
                    <tr key={p.id} className="[&>td]:px-3 [&>td]:py-2">
                      <td className="text-muted-foreground">{SLOT_META[p.slot].label}</td>
                      <td>
                        {p.componentSlug ? <Link href={`/components/${p.componentSlug}`} className="hover:text-accent">{p.name}</Link> : p.name}
                        <span className="block text-xs text-muted-foreground">{[p.brand, p.model].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td><ProvenanceBadge kind={p.custom ? "custom" : p.verification} /></td>
                      <td className="text-right"><DataValue>{p.weightG !== null ? formatWeight(p.weightG) : null}</DataValue></td>
                      <td className="text-right"><DataValue>{p.pricePaid !== null ? formatMoney(p.pricePaid, p.currency) : null}</DataValue></td>
                      <td className="text-right"><DataValue>{p.priceReference !== null ? formatMoney(p.priceReference, p.currency) : null}</DataValue></td>
                      <td className="text-muted-foreground"><DataValue mono={false}>{p.installedOn ? formatDate(p.installedOn) : null}</DataValue></td>
                      <td><PartActions bikeId={bike.id} part={p} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile: simplified list */}
            <ul className="divide-y divide-border border-y border-border md:hidden">
              {ordered.map((p) => (
                <li key={p.id} className="flex items-start gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="eyebrow">{SLOT_META[p.slot].label}</span>
                    <p className="truncate text-sm">{p.name}</p>
                    <p className="figure text-xs text-muted-foreground">{formatWeight(p.weightG)} · {p.pricePaid !== null ? formatMoney(p.pricePaid, p.currency) : "price —"}</p>
                  </div>
                  <PartActions bikeId={bike.id} part={p} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <SectionTitle>Compatibility report</SectionTitle>
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No compatibility rules apply to the recorded parts yet. Rules need structured data on both sides (e.g. frame + wheelset).</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {checks.length} checks · <span className="text-danger">{bad.length} incompatible</span> · <span className="text-warning">{unknown.length} require verification</span>
            </p>
            <ul className="divide-y divide-border border-y border-border text-sm">
              {[...bad, ...unknown, ...checks.filter((c) => c.status === "compatible")].map((c, i) => (
                <li key={i} className="flex items-start gap-2 py-2">
                  {c.status === "compatible" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : c.status === "incompatible" ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" />}
                  <div className="min-w-0">
                    <p>{c.label}</p>
                    <p className="break-words text-xs text-muted-foreground">{c.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
