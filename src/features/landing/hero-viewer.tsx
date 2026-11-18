"use client";
import { useState } from "react";
import { LazyBikeViewer } from "@/features/studio/three/LazyBikeViewer";
import type { BikeSlot } from "@/lib/domain/slots";

/** Landing showcase: the same viewer as the studio, read-only, slowly rotating. */
export function HeroViewer() {
  const [selected, setSelected] = useState<BikeSlot | null>(null);
  return (
    <LazyBikeViewer
      modelKey="velox-placeholder-road"
      selectedSlot={selected}
      onSelectSlot={setSelected}
      autoRotate={!selected}
      paintColor="#3a3f47"
      className="h-[360px] border border-border sm:h-[460px] lg:h-[540px]"
    />
  );
}
