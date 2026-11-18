import type { BikeSlot } from "@/lib/domain/slots";
import type { PartRef } from "@/lib/compatibility/engine";
import type { CatalogComponent, InstalledPart, RevisionChange, SnapshotEntry } from "@/types/domain";
import type { ConfigurationChange } from "@/lib/validation/schemas";

/**
 * Studio pending-change model. The studio keeps a map of slot → pending action
 * and only persists on explicit confirmation (→ apply_bicycle_configuration RPC).
 */
export type PendingAction =
  | { kind: "replace"; component: CatalogComponent }
  | { kind: "custom"; name: string }
  | { kind: "remove" };

export type PendingMap = Partial<Record<BikeSlot, PendingAction>>;

export function toPartRef(part: InstalledPart): PartRef {
  return { slot: part.slot, name: part.name, attributes: part.attributes };
}

export function candidateRef(slot: BikeSlot, c: CatalogComponent): PartRef {
  return { slot, name: c.name, attributes: c.attributes };
}

/** The configuration as it would be after applying pending changes (for preview + compat). */
export function previewParts(installed: InstalledPart[], pending: PendingMap): PartRef[] {
  const map = new Map<BikeSlot, PartRef>(installed.map((p) => [p.slot, toPartRef(p)]));
  for (const [slot, action] of Object.entries(pending) as [BikeSlot, PendingAction][]) {
    if (action.kind === "remove") map.delete(slot);
    else if (action.kind === "custom") map.set(slot, { slot, name: action.name, attributes: {} });
    else map.set(slot, candidateRef(slot, action.component));
  }
  return [...map.values()];
}

/** Payload for the RPC. Slots whose pending action equals the current part are dropped. */
export function buildChanges(installed: InstalledPart[], pending: PendingMap): ConfigurationChange[] {
  const current = new Map(installed.map((p) => [p.slot, p]));
  const changes: ConfigurationChange[] = [];
  for (const [slot, action] of Object.entries(pending) as [BikeSlot, PendingAction][]) {
    const existing = current.get(slot);
    if (action.kind === "remove") {
      if (existing) changes.push({ slot, remove: true });
    } else if (action.kind === "custom") {
      if (!existing || existing.componentId || existing.name !== action.name) changes.push({ slot, component_id: null, custom_name: action.name });
    } else if (existing?.componentId !== action.component.id) {
      changes.push({ slot, component_id: action.component.id });
    }
  }
  return changes;
}

/**
 * TypeScript mirror of public.diff_configurations() — used for client-side
 * previews of what a save will record, and covered by tests against the SQL.
 */
export function diffSnapshots(prev: Record<string, SnapshotEntry>, next: Record<string, SnapshotEntry>): RevisionChange[] {
  const slots = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort();
  const out: RevisionChange[] = [];
  for (const slot of slots) {
    const a = prev[slot];
    const b = next[slot];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    let action: RevisionChange["action"];
    if (!a) action = "added";
    else if (!b) action = "removed";
    else if (a.component_id !== b.component_id || a.name !== b.name) action = "replaced";
    else action = "updated";
    out.push({ slot: slot as BikeSlot, action, ...(a ? { from: a } : {}), ...(b ? { to: b } : {}) });
  }
  return out;
}

export function parseChanges(value: unknown): RevisionChange[] {
  return Array.isArray(value) ? (value as RevisionChange[]) : [];
}
