"use client";
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { BIKE_SLOTS, SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { parseChanges } from "@/lib/configuration";
import { formatDate, formatWeight } from "@/lib/format";
import type { SnapshotEntry } from "@/types/domain";
import { ProvenanceBadge } from "@/components/common/provenance";
import { cn } from "@/lib/utils";
import { ChangeLine } from "./revision-list";

export interface InspectableRevision {
  id: string;
  revision_number: number;
  description: string | null;
  created_at: string;
  changes: unknown;
  previous_configuration: unknown;
  new_configuration: unknown;
}

type Snapshot = Record<string, SnapshotEntry>;
const asSnapshot = (v: unknown): Snapshot => (v && typeof v === "object" && !Array.isArray(v) ? (v as Snapshot) : {});

function snapshotWeight(s: Snapshot) {
  const entries = Object.entries(s).filter(([slot]) => slot !== "groupset");
  const known = entries.filter(([, e]) => typeof e.weight_g === "number");
  return { value: known.length ? known.reduce((a, [, e]) => a + (e.weight_g ?? 0), 0) : null, known: known.length, total: entries.length };
}

/** Browse previous builds: each revision's full configuration snapshot and its diff. */
export function RevisionInspector({ revisions }: { revisions: InspectableRevision[] }) {
  const [selectedId, setSelectedId] = useState(revisions[0]?.id);
  const [compare, setCompare] = useState(true);
  const rev = revisions.find((r) => r.id === selectedId) ?? revisions[0];
  const next = useMemo(() => asSnapshot(rev?.new_configuration), [rev]);
  const prev = useMemo(() => asSnapshot(rev?.previous_configuration), [rev]);
  if (!rev) return null;
  const changed = new Set(parseChanges(rev.changes).map((c) => c.slot));
  const slots = BIKE_SLOTS.filter((s) => next[s] || (compare && prev[s]));
  const w = snapshotWeight(next);
  const pw = snapshotWeight(prev);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <ol className="scrollbar-thin flex max-h-[70dvh] flex-col overflow-y-auto border-y border-border lg:border" aria-label="Revisions">
        {revisions.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
              aria-current={r.id === rev.id ? "true" : undefined}
              className={cn("flex w-full cursor-pointer flex-col gap-0.5 border-l-2 px-3 py-2 text-left", r.id === rev.id ? "border-accent bg-surface-raised" : "border-transparent hover:bg-surface")}
            >
              <span className="flex items-center justify-between text-xs">
                <span className="figure">Revision {r.revision_number}</span>
                <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
              </span>
              <span className="truncate text-sm">{r.description ?? `${parseChanges(r.changes).length} change(s)`}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            <span className="eyebrow flex items-center gap-1.5"><History className="size-3" /> Revision {rev.revision_number} · {formatDate(rev.created_at, { dateStyle: "medium", timeStyle: "short" })}</span>
            <h2 className="mt-1 text-base font-semibold">{rev.description ?? "Configuration change"}</h2>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[var(--accent)]" />
            Compare with previous build
          </label>
        </div>

        <ul className="my-4 flex flex-col gap-1.5">
          {parseChanges(rev.changes).map((c, i) => <ChangeLine key={i} change={c} />)}
        </ul>

        <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Parts: <span className="figure text-foreground">{Object.keys(next).length}</span></span>
          <span>
            Known weight: <span className="figure text-foreground">{w.value !== null ? formatWeight(w.value) : "Unavailable"}</span>
            {w.value !== null && w.known < w.total && ` (${w.known}/${w.total} parts)`}
            {compare && pw.value !== null && w.value !== null && (
              <span className={cn("figure ml-1", w.value - pw.value > 0 ? "text-danger" : "text-success")}>
                {w.value - pw.value > 0 ? "+" : ""}{Math.round(w.value - pw.value)} g
              </span>
            )}
          </span>
        </div>

        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:text-muted-foreground">
                <th>Position</th>
                {compare && <th>Before</th>}
                <th>{compare ? "After" : "Part"}</th>
                <th className="text-right">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slots.map((slot) => {
                const a = prev[slot];
                const b = next[slot];
                return (
                  <tr key={slot} className={cn("[&>td]:px-3 [&>td]:py-1.5", changed.has(slot as BikeSlot) && "bg-accent-muted")}>
                    <td className="whitespace-nowrap text-muted-foreground">{SLOT_META[slot].label}</td>
                    {compare && <td className="text-muted-foreground">{a?.name ?? "—"}</td>}
                    <td>
                      {b ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {b.name}
                          {b.verification_status === "demo" && <ProvenanceBadge kind="demo" />}
                          {b.custom && <ProvenanceBadge kind="custom" />}
                        </span>
                      ) : (
                        <span className="text-subtle-foreground">Removed</span>
                      )}
                    </td>
                    <td className="figure text-right">{b?.weight_g ? formatWeight(b.weight_g) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-subtle-foreground">Snapshots preserve part names and data as they were when the revision was saved. Revisions are immutable.</p>
      </div>
    </div>
  );
}
