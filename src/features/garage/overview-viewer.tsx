"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LazyBikeViewer } from "@/features/studio/three/LazyBikeViewer";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { formatWeight } from "@/lib/format";

export interface OverviewPart {
  slot: BikeSlot;
  name: string;
  brand: string | null;
  weightG: number | null;
  tireWidth?: number;
}

export function OverviewViewer({ bikeId, modelKey, paintColor, parts }: { bikeId: string; modelKey: string; paintColor: string | null; parts: OverviewPart[] }) {
  const [selected, setSelected] = useState<BikeSlot | null>(null);
  const part = parts.find((p) => p.slot === selected);
  return (
    <div className="flex flex-col border border-border">
      <LazyBikeViewer
        modelKey={modelKey}
        selectedSlot={selected}
        onSelectSlot={setSelected}
        paintColor={paintColor}
        recordedSlots={parts.map((p) => p.slot)}
        tireWidthMm={{ front: parts.find((p) => p.slot === "front_tire")?.tireWidth, rear: parts.find((p) => p.slot === "rear_tire")?.tireWidth }}
        className="aspect-[4/3] sm:aspect-[16/9]"
      />
      <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm">
        {selected ? (
          <div className="min-w-0">
            <span className="eyebrow">{SLOT_META[selected].label}</span>
            <p className="truncate">
              {part ? (
                <>
                  {part.name} <span className="figure text-xs text-muted-foreground">{part.weightG ? `· ${formatWeight(part.weightG)}` : ""}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </p>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Select a part on the model to inspect it.</span>
        )}
        <Link href={`/garage/${bikeId}/studio${selected ? `?slot=${selected}` : ""}`} className="flex shrink-0 items-center gap-1 text-xs text-accent hover:underline">
          Open in Studio <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
