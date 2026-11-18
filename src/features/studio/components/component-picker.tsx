"use client";
import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProvenanceBadge } from "@/components/common/provenance";
import { checkCompatibility, type CompatibilityStatus } from "@/lib/compatibility";
import { candidateRef } from "@/lib/configuration";
import type { PartRef } from "@/lib/compatibility/engine";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { formatMoney, formatWeight } from "@/lib/format";
import type { CatalogComponent } from "@/types/domain";
import { cn } from "@/lib/utils";
import { CompatBadge, CompatDetails } from "./compat-badge";
import { SpecList } from "./spec-list";

const ORDER: Record<CompatibilityStatus, number> = { compatible: 0, unknown: 1, incompatible: 2 };

async function fetchCandidates(slot: BikeSlot, q: string): Promise<CatalogComponent[]> {
  const params = new URLSearchParams({ slot });
  if (q) params.set("q", q);
  const res = await fetch(`/api/studio/candidates?${params}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load components");
  return (await res.json()).items;
}

interface Props {
  slot: BikeSlot;
  /** The configuration around this slot (pending changes applied, this slot excluded). */
  context: PartRef[];
  currentComponentId: string | null;
  pendingComponentId: string | null;
  onPreview: (component: CatalogComponent) => void;
  onCustom: (name: string) => void;
}

/** Step 1–3 of replacement: browse options for the slot, inspect specs and compatibility, choose to preview. */
export function ComponentPicker({ slot, context, currentComponentId, pendingComponentId, onPreview, onCustom }: Props) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [custom, setCustom] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["candidates", slot, deferred],
    queryFn: () => fetchCandidates(slot, deferred),
  });

  const rows = useMemo(() => {
    const list = (data ?? []).map((c) => ({ c, report: checkCompatibility(candidateRef(slot, c), context) }));
    return list
      .filter((r) => !onlyCompatible || r.report.status !== "incompatible")
      .sort((a, b) => ORDER[a.report.status] - ORDER[b.report.status] || a.c.name.localeCompare(b.c.name));
  }, [data, context, slot, onlyCompatible]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${SLOT_META[slot].label.toLowerCase()} options`} className="pl-9" aria-label="Search components" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyCompatible} onChange={(e) => setOnlyCompatible(e.target.checked)} className="accent-[var(--accent)]" />
          Hide incompatible options
        </label>
      </div>

      {isLoading && <p className="py-6 text-center text-xs text-muted-foreground" role="status">Loading options…</p>}
      {isError && <p className="py-6 text-center text-xs text-danger">{(error as Error).message}</p>}
      {!isLoading && !isError && rows.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No catalogue entries for this position{deferred ? " match your search" : ""}.{" "}
          <Link href="/components?submit=1" className="text-accent hover:underline">Submit a component</Link> or add a custom part below.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {rows.map(({ c, report }) => {
          const isCurrent = c.id === currentComponentId;
          const isPending = c.id === pendingComponentId;
          const open = expanded === c.id;
          return (
            <li key={c.id} className={cn("py-2.5", isPending && "bg-info/5")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.brandName}
                    {c.model ? ` · ${c.model}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <CompatBadge status={report.status} />
                    <ProvenanceBadge kind={c.verification} />
                    <span className="figure text-[11px] text-muted-foreground">
                      {formatWeight(c.weightG)} · {formatMoney(c.priceReference, c.currency)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isCurrent ? (
                    <span className="text-[11px] text-muted-foreground">Installed</span>
                  ) : (
                    <Button size="sm" variant={isPending ? "outline" : "secondary"} onClick={() => onPreview(c)} disabled={isPending}>
                      {isPending ? "Previewing" : "Preview"}
                    </Button>
                  )}
                  <button type="button" onClick={() => setExpanded(open ? null : c.id)} className="flex cursor-pointer items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={open}>
                    Inspect {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </button>
                </div>
              </div>
              {open && (
                <div className="mt-2 flex flex-col gap-3">
                  <CompatDetails report={report} />
                  <SpecList specs={c.specs} attributes={c.attributes} />
                  <Link href={`/components/${c.slug}`} target="_blank" className="text-xs text-accent hover:underline">Open component page</Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="flex flex-col gap-1.5 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) {
            onCustom(custom.trim());
            setCustom("");
          }
        }}
      >
        <span className="text-xs text-muted-foreground">Part not in the registry? Record it as a custom part (no specs, compatibility unknown).</span>
        <div className="flex gap-2">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Vintage alloy bell" maxLength={120} aria-label="Custom part name" />
          <Button type="submit" variant="outline" disabled={!custom.trim()}>Use</Button>
        </div>
      </form>
    </div>
  );
}
