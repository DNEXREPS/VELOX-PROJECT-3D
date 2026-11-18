import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { UNAVAILABLE } from "@/lib/format";

/** Renders a value, or a muted "Unavailable" when missing — never a fabricated fallback. */
export function DataValue({ children, mono = true, className }: { children: ReactNode; mono?: boolean; className?: string }) {
  const missing = children === null || children === undefined || children === "" || children === UNAVAILABLE;
  return (
    <span className={cn(missing ? "text-subtle-foreground italic" : mono && "figure", className)}>{missing ? UNAVAILABLE : children}</span>
  );
}

export interface SpecItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/** Dense two-column spec table. Collapses to stacked rows on narrow screens. */
export function SpecTable({ items, className }: { items: SpecItem[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border border-y border-border text-sm", className)}>
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 text-right [overflow-wrap:anywhere] sm:text-left">
            <DataValue>{it.value}</DataValue>
            {it.hint && <span className="ml-2">{it.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="eyebrow">{label}</span>
      <span className="truncate text-lg font-medium leading-tight">
        <DataValue>{value}</DataValue>
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
