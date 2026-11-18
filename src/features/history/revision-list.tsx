import Link from "next/link";
import { ArrowRight, Minus, Plus, RefreshCw } from "lucide-react";
import { SLOT_META, isBikeSlot } from "@/lib/domain/slots";
import { parseChanges } from "@/lib/configuration";
import { formatDate } from "@/lib/format";
import type { RevisionChange } from "@/types/domain";
import { cn } from "@/lib/utils";

const ACTION_ICON = { added: Plus, removed: Minus, replaced: RefreshCw, updated: RefreshCw } as const;
const ACTION_TONE = { added: "text-success", removed: "text-danger", replaced: "text-accent", updated: "text-info" } as const;

export function ChangeLine({ change }: { change: RevisionChange }) {
  const Icon = ACTION_ICON[change.action] ?? RefreshCw;
  const slot = isBikeSlot(change.slot) ? SLOT_META[change.slot].label : change.slot;
  return (
    <li className="flex min-w-0 items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", ACTION_TONE[change.action])} aria-label={change.action} />
      <span className="w-28 shrink-0 text-muted-foreground">{slot}</span>
      <span className="min-w-0 flex-1 break-words">
        {change.action === "replaced" ? (
          <>
            <span className="text-muted-foreground line-through decoration-border-strong">{change.from?.name}</span>
            <ArrowRight className="mx-1 inline size-3 text-subtle-foreground" />
            {change.to?.name}
          </>
        ) : change.action === "removed" ? (
          <span className="text-muted-foreground">{change.from?.name}</span>
        ) : (
          change.to?.name
        )}
        {change.action === "updated" && <span className="ml-1 text-xs text-subtle-foreground">(details updated)</span>}
      </span>
    </li>
  );
}

export interface RevisionSummary {
  id: string;
  revision_number: number;
  description: string | null;
  created_at: string;
  changes: unknown;
  bikeName?: string;
  href?: string;
}

/** Compact revision timeline (dashboard, overview, passport). */
export function RevisionList({ revisions, max = 5 }: { revisions: RevisionSummary[]; max?: number }) {
  return (
    <ol className="relative flex flex-col gap-4 border-l border-border pl-4">
      {revisions.slice(0, max).map((r) => {
        const changes = parseChanges(r.changes);
        return (
          <li key={r.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-accent" aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span className="figure text-foreground">Rev {r.revision_number}</span>
              <span>{formatDate(r.created_at)}</span>
              {r.bikeName && (r.href ? <Link href={r.href} className="hover:text-foreground">{r.bikeName}</Link> : <span>{r.bikeName}</span>)}
            </div>
            {r.description && <p className="mt-0.5 text-sm">{r.description}</p>}
            <ul className="mt-1.5 flex flex-col gap-1">
              {changes.slice(0, 4).map((c, i) => <ChangeLine key={`${c.slot}-${i}`} change={c} />)}
              {changes.length > 4 && <li className="text-xs text-subtle-foreground">+{changes.length - 4} more changes</li>}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
