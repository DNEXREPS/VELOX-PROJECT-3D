"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Box, Expand, History, Minimize, RotateCcw, ScanLine } from "lucide-react";
import type { AssemblySpec, ManifestEntry } from "@/lib/assembly/spec";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { cn } from "@/lib/utils";
import { detectWebGL } from "../three/webgl";
import { ViewerErrorBoundary } from "../three/ViewerErrorBoundary";
import type { RenderState } from "./AssemblyCanvas";
import { computePresets } from "./presets";
import { SideView2D } from "./SideView2D";

const AssemblyCanvas = dynamic(() => import("./AssemblyCanvas").then((m) => m.AssemblyCanvas), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center" role="status">
      <span className="eyebrow">Preparing modular viewer…</span>
    </div>
  ),
});

const subscribeNoop = () => () => {};

export interface ModularViewerProps {
  /** Assembly with pending changes applied (what the user is previewing). */
  spec: AssemblySpec;
  /** Assembly of the saved configuration (for the before/after toggle). */
  savedSpec: AssemblySpec;
  manifest: Map<string, ManifestEntry>;
  baseUrl: string;
  selectedSlot: BikeSlot | null;
  pendingSlots: BikeSlot[];
  paintColor: string | null;
  onSelectSlot: (slot: BikeSlot | null) => void;
  onFallback: (reason: string) => void;
  className?: string;
}

declare global {
  interface Window {
    __veloxStudio?: unknown;
  }
}

/** Studio viewer for the modular engine: 3D (WebGL) and 2D from the same AssemblySpec. */
export function ModularViewer(props: ModularViewerProps) {
  const { spec, savedSpec, selectedSlot, pendingSlots } = props;
  const webgl = useSyncExternalStore(subscribeNoop, detectWebGL, () => true);
  const [mode, setMode] = useState<"3d" | "2d" | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [hovered, setHovered] = useState<BikeSlot | null>(null);
  const [preset, setPreset] = useState({ id: "three-quarter", nonce: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [render, setRender] = useState<RenderState | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const viewMode = !webgl ? "2d" : (mode ?? "3d");
  const shown = showBefore && pendingSlots.length > 0 ? savedSpec : spec;
  const presets = useMemo(() => computePresets(shown), [shown]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Machine-readable state for automated tests (no personal data).
  useEffect(() => {
    window.__veloxStudio = {
      viewer: "modular",
      mode: viewMode,
      showingBefore: shown === savedSpec && showBefore,
      fingerprint: shown.fingerprint,
      derived: shown.derived,
      nodes: shown.nodes.map((n) => ({ id: n.id, slot: n.slot, status: n.status, representation: n.representation, missing: n.missing, warnings: n.warnings, sig: n.status === "ok" ? n.source && (n.source.kind === "asset" ? `asset:${n.source.key}@${n.source.version}:${n.source.sha256.slice(0, 12)}` : `gen:${n.source.generator}@${n.source.version}:${n.source.variant ?? ""}:${JSON.stringify(n.source.params)}`) : null })),
      render,
    };
  }, [shown, savedSpec, showBefore, render, viewMode]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
    } catch {
      /* not available (iOS Safari) */
    }
  };
  const errors = render?.errors ?? [];

  return (
    <div ref={ref} className={cn("relative isolate overflow-hidden bg-surface-sunken hairline-grid", props.className)} data-testid="modular-viewer">
      {viewMode === "3d" ? (
        <ViewerErrorBoundary
          model="assembly"
          fallback={(error) => {
            queueMicrotask(() => props.onFallback(error.message || "3D renderer failed"));
            return null;
          }}
        >
          <AssemblyCanvas
            className="!absolute inset-0 touch-none"
            spec={shown}
            manifest={props.manifest}
            baseUrl={props.baseUrl}
            selectedSlot={selectedSlot}
            hoveredSlot={hovered}
            pendingSlots={showBefore ? [] : pendingSlots}
            paintColor={props.paintColor}
            presetId={preset.id}
            presetNonce={preset.nonce}
            onHoverSlot={setHovered}
            onSelectSlot={props.onSelectSlot}
            onState={setRender}
          />
        </ViewerErrorBoundary>
      ) : (
        <div className="absolute inset-0 p-4 sm:p-8">
          <SideView2D spec={shown} selectedSlot={selectedSlot} pendingSlots={showBefore ? [] : pendingSlots} onSelectSlot={props.onSelectSlot} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex flex-wrap gap-1">
          {viewMode === "3d" &&
            presets.map((p) => (
              <button key={p.id} type="button" onClick={() => setPreset((s) => ({ id: p.id, nonce: s.nonce + 1 }))} className={cn("rounded-sm border border-border bg-surface/80 px-2 py-1 text-xs backdrop-blur", preset.id === p.id && "border-accent text-accent")}>
                {p.label}
              </button>
            ))}
        </div>
        <div className="pointer-events-auto flex gap-1">
          {pendingSlots.length > 0 && (
            <button type="button" aria-pressed={showBefore} onClick={() => setShowBefore((v) => !v)} className={cn("flex items-center gap-1 rounded-sm border border-border bg-surface/80 px-2 py-1 text-xs backdrop-blur", showBefore && "border-info text-info")} data-testid="toggle-before">
              <History className="size-3.5" /> {showBefore ? "Showing saved" : "Show saved"}
            </button>
          )}
          {webgl && (
            <button type="button" onClick={() => setMode(viewMode === "3d" ? "2d" : "3d")} className="flex items-center gap-1 rounded-sm border border-border bg-surface/80 px-2 py-1 text-xs backdrop-blur" aria-label={viewMode === "3d" ? "Show 2D side view" : "Show 3D view"} data-testid="toggle-2d">
              {viewMode === "3d" ? <ScanLine className="size-3.5" /> : <Box className="size-3.5" />} {viewMode === "3d" ? "2D" : "3D"}
            </button>
          )}
          {viewMode === "3d" && (
            <button type="button" onClick={() => setPreset((s) => ({ id: "three-quarter", nonce: s.nonce + 1 }))} className="rounded-sm border border-border bg-surface/80 p-1 backdrop-blur" aria-label="Reset camera">
              <RotateCcw className="size-3.5" />
            </button>
          )}
          <button type="button" onClick={toggleFullscreen} className="rounded-sm border border-border bg-surface/80 p-1 backdrop-blur" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize className="size-3.5" /> : <Expand className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-2 text-xs">
        <span className="rounded-sm bg-surface/80 px-2 py-1 backdrop-blur">
          {hovered ? SLOT_META[hovered].label : showBefore ? "Saved configuration" : pendingSlots.length ? "Preview with pending changes" : "Modular assembly (beta)"}
        </span>
        {(render?.pending ?? 0) > 0 && <span className="rounded-sm bg-surface/80 px-2 py-1 backdrop-blur" role="status">Loading parts…</span>}
        {errors.length > 0 && <span className="rounded-sm bg-danger/15 px-2 py-1 text-danger" role="alert">Some parts could not be loaded ({errors.length})</span>}
      </div>
    </div>
  );
}
