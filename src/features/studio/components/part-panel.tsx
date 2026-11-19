"use client";
import { ArrowRight, Box, Info, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ProvenanceBadge } from "@/components/common/provenance";
import { DataValue } from "@/components/common/data-value";
import { checkCompatibility } from "@/lib/compatibility";
import { candidateRef, type PendingAction } from "@/lib/configuration";
import type { PartRef } from "@/lib/compatibility/engine";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";
import type { InstalledPart } from "@/types/domain";
import type { BikeModelMeta } from "../models/types";
import { CompatDetails } from "./compat-badge";
import { ComponentPicker } from "./component-picker";
import { SpecList } from "./spec-list";

interface Props {
  slot: BikeSlot;
  installed: InstalledPart | null;
  pending: PendingAction | undefined;
  context: PartRef[];
  meta: BikeModelMeta;
  mode: "detail" | "replace";
  onModeChange: (mode: "detail" | "replace") => void;
  onPending: (action: PendingAction | null) => void;
  onClose: () => void;
  /** Modular engine: truthful 3D status for the saved part and the pending preview. */
  geometry?: { saved: ReactNode; preview: ReactNode };
}

/** Contextual panel for the selected slot: current part, pending preview, and the replacement flow. */
export function PartPanel({ slot, installed, pending, context, meta, mode, onModeChange, onPending, onClose, geometry }: Props) {
  const mapping = meta.slots[slot];
  const visual = mapping?.visual.kind ?? "none";
  const pendingComponent = pending?.kind === "replace" ? pending.component : null;
  const report = pendingComponent ? checkCompatibility(candidateRef(slot, pendingComponent), context) : null;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="eyebrow">{SLOT_META[slot].group}</span>
          <h2 className="text-base font-semibold">{SLOT_META[slot].label}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
          <X />
        </Button>
      </div>

      {/* Current part */}
      <section className="flex flex-col gap-2">
        <span className="eyebrow">Installed</span>
        {installed ? (
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium">{installed.name}</p>
              <p className="text-xs text-muted-foreground">{[installed.brand, installed.model].filter(Boolean).join(" · ") || "No brand/model recorded"}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ProvenanceBadge kind={installed.custom ? "custom" : installed.verification} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Weight</dt>
                <dd><DataValue>{installed.weightG !== null ? formatWeight(installed.weightG) : null}</DataValue></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Price paid</dt>
                <dd><DataValue>{installed.pricePaid !== null ? formatMoney(installed.pricePaid, installed.currency) : null}</DataValue></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ref. price</dt>
                <dd><DataValue>{installed.priceReference !== null ? formatMoney(installed.priceReference, installed.currency) : null}</DataValue></dd>
              </div>
            </dl>
            {installed.installedOn && <p className="text-xs text-muted-foreground">Installed {formatDate(installed.installedOn)}</p>}
            {geometry && !pending && geometry.saved}
            {mode === "detail" && <SpecList specs={installed.specs} attributes={installed.attributes} />}
            {installed.componentSlug && mode === "detail" && (
              <Link href={`/components/${installed.componentSlug}`} className="text-xs text-accent hover:underline">Component page</Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No part recorded for this position.</p>
        )}
      </section>

      {/* Pending change */}
      {pending && (
        <section className="flex flex-col gap-2 border border-info/40 bg-info/5 p-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-info">Pending change — not saved</span>
            <Button variant="ghost" size="sm" onClick={() => onPending(null)}>
              <Undo2 /> Discard
            </Button>
          </div>
          {pending.kind === "remove" ? (
            <p className="text-sm">Remove {installed?.name ?? "part"} from the build.</p>
          ) : (
            <p className="flex flex-wrap items-center gap-1 text-sm">
              <span className="text-muted-foreground">{installed?.name ?? "Empty"}</span>
              <ArrowRight className="size-3.5 text-subtle-foreground" />
              <span className="font-medium">{pending.kind === "replace" ? pending.component.name : pending.name}</span>
            </p>
          )}
          {report && <CompatDetails report={report} />}
          {pending.kind === "custom" && <p className="text-xs text-muted-foreground">Custom parts have no structured data — compatibility cannot be verified.</p>}
          {pending.kind !== "remove" && geometry && geometry.preview}
          {pending.kind !== "remove" && !geometry && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              {visual === "tire-width" ? <Box className="mt-px size-3.5 shrink-0 text-info" /> : <Info className="mt-px size-3.5 shrink-0" />}
              {visual === "tire-width"
                ? pendingComponent?.attributes.tire_width_mm
                  ? `3D preview: tire geometry scaled to ${pendingComponent.attributes.tire_width_mm} mm from the component's data.`
                  : "3D preview unavailable: this tire has no width recorded."
                : visual === "static"
                  ? "Data-only preview: the current 3D model has no product-specific geometry for this part. The slot is highlighted, but its shape does not change."
                  : "This position has no geometry in the current 3D model."}
            </p>
          )}
        </section>
      )}

      {/* Actions / replacement flow */}
      {mode === "detail" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => onModeChange("replace")}>
            {installed ? "Replace part" : "Add part"}
          </Button>
          {installed && pending?.kind !== "remove" && (
            <Button variant="outline" size="sm" onClick={() => onPending({ kind: "remove" })}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      ) : (
        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Choose a {SLOT_META[slot].label.toLowerCase()}</span>
            <Button variant="ghost" size="sm" onClick={() => onModeChange("detail")}>Done</Button>
          </div>
          <ComponentPicker
            slot={slot}
            context={context}
            currentComponentId={installed?.componentId ?? null}
            pendingComponentId={pendingComponent?.id ?? null}
            onPreview={(component) => onPending({ kind: "replace", component })}
            onCustom={(name) => onPending({ kind: "custom", name })}
          />
        </section>
      )}
    </div>
  );
}
