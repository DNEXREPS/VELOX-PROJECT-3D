"use client";
import { SLOT_GROUPS, SLOT_META, BIKE_SLOTS, type BikeSlot } from "@/lib/domain/slots";
import type { PendingMap } from "@/lib/configuration";
import type { CompatibilityStatus } from "@/lib/compatibility";
import type { InstalledPart } from "@/types/domain";
import { cn } from "@/lib/utils";

interface Props {
  installed: Map<BikeSlot, InstalledPart>;
  pending: PendingMap;
  issues: Partial<Record<BikeSlot, CompatibilityStatus>>;
  selected: BikeSlot | null;
  onSelect: (slot: BikeSlot) => void;
  geometrySlots: Set<BikeSlot>;
}

const dot: Record<CompatibilityStatus, string> = { compatible: "bg-success", unknown: "bg-warning", incompatible: "bg-danger" };

/** Grouped list of all positions — the keyboard-accessible counterpart of clicking the 3D model. */
export function SlotList({ installed, pending, issues, selected, onSelect, geometrySlots }: Props) {
  return (
    <nav aria-label="Bicycle components" className="flex flex-col gap-4">
      {SLOT_GROUPS.map((g) => {
        const slots = BIKE_SLOTS.filter((s) => SLOT_META[s].group === g.id);
        return (
          <div key={g.id}>
            <h3 className="eyebrow mb-1 px-2">{g.label}</h3>
            <ul>
              {slots.map((s) => {
                const part = installed.get(s);
                const p = pending[s];
                const issue = issues[s];
                const name = p ? (p.kind === "remove" ? "Removed" : p.kind === "replace" ? p.component.name : p.name) : part?.name;
                return (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => onSelect(s)}
                      aria-current={selected === s ? "true" : undefined}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 border-l-2 px-2 py-1.5 text-left",
                        selected === s ? "border-accent bg-surface-raised" : "border-transparent hover:bg-surface-raised/60",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {SLOT_META[s].label}
                          {!geometrySlots.has(s) && <span className="text-[10px] text-subtle-foreground" title="No geometry in this 3D model">· data only</span>}
                        </span>
                        <span className={cn("block truncate text-[13px]", !name && "text-subtle-foreground", p && "text-info", p?.kind === "remove" && "line-through")}>
                          {name ?? "Not recorded"}
                        </span>
                      </span>
                      {issue && issue !== "compatible" && <span className={cn("size-1.5 shrink-0 rounded-full", dot[issue])} title={issue === "incompatible" ? "Incompatibility detected" : "Requires verification"} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
