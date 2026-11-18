"use client";
import dynamic from "next/dynamic";
import type { BikeViewerProps } from "./BikeViewer";
import { cn } from "@/lib/utils";

/**
 * Code-split entry point: three.js / R3F are only downloaded on pages that render
 * a viewer, and never server-rendered.
 */
const BikeViewer = dynamic(() => import("./BikeViewer"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center" role="status">
      <span className="eyebrow">Preparing viewer…</span>
    </div>
  ),
});

export function LazyBikeViewer({ className, ...props }: BikeViewerProps) {
  return (
    <div className={cn("relative bg-surface-sunken hairline-grid", className)}>
      <BikeViewer {...props} className="absolute inset-0" />
    </div>
  );
}

export type { BikeViewerProps };
