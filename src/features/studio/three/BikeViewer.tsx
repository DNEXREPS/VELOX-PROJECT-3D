"use client";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, useProgress } from "@react-three/drei";
import { Box, Expand, Ghost, Info, Minimize, RotateCcw, ScanLine } from "lucide-react";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { cn } from "@/lib/utils";
import { getModelMeta } from "../models/registry";
import { BikeScene } from "./BikeScene";
import { BikeProfile2D } from "./BikeProfile2D";
import { ViewerErrorBoundary } from "./ViewerErrorBoundary";
import { detectWebGL, isLowPowerDevice } from "./webgl";
import type { CameraCommand } from "./CameraRig";

export interface BikeViewerProps {
  modelKey: string | null | undefined;
  selectedSlot?: BikeSlot | null;
  onSelectSlot?: (slot: BikeSlot | null) => void;
  pendingSlots?: BikeSlot[];
  /** Slots that have a part recorded. null = unknown (nothing is ghosted). */
  recordedSlots?: BikeSlot[] | null;
  paintColor?: string | null;
  tireWidthMm?: { front?: number; rear?: number };
  interactive?: boolean;
  autoRotate?: boolean;
  /** Show the camera / view toolbar. */
  controls?: boolean;
  className?: string;
  /** Initial view mode. "auto" picks 3D when WebGL is available. */
  initialMode?: "auto" | "3d" | "2d";
}

type Mode = "3d" | "2d";

const subscribeNoop = () => () => {};

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status" aria-live="polite">
      <div className="flex w-48 flex-col items-center gap-2">
        <span className="eyebrow">Loading 3D model</span>
        <div className="h-0.5 w-full overflow-hidden bg-border">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress)}%` }} />
        </div>
        <span className="figure text-xs text-muted-foreground">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

export default function BikeViewer({
  modelKey,
  selectedSlot = null,
  onSelectSlot,
  pendingSlots = [],
  recordedSlots = null,
  paintColor = null,
  tireWidthMm = {},
  interactive = true,
  autoRotate = false,
  controls = true,
  className,
  initialMode = "auto",
}: BikeViewerProps) {
  const meta = getModelMeta(modelKey);
  const containerRef = useRef<HTMLDivElement>(null);
  // Capability checks are client-only; useSyncExternalStore avoids hydration mismatches.
  const webgl = useSyncExternalStore(subscribeNoop, detectWebGL, () => true);
  const lowPower = useSyncExternalStore(subscribeNoop, isLowPowerDevice, () => false);
  const [chosenMode, setChosenMode] = useState<Mode | null>(initialMode === "auto" ? null : initialMode);
  const [failed, setFailed] = useState<string | null>(null);
  const [hovered, setHovered] = useState<BikeSlot | null>(null);
  const [camera, setCamera] = useState<CameraCommand>({ presetId: meta.defaultPreset, nonce: 0 });
  const [ghost, setGhost] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dpr, setDpr] = useState<number>(1.5);

  const mode: Mode = !webgl || failed ? "2d" : (chosenMode ?? "3d");

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => () => void (document.body.style.cursor = "auto"), []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* Fullscreen API unavailable (e.g. iOS Safari for non-video elements). */
    }
  }, []);

  const setPreset = (presetId: string) => setCamera((c) => ({ presetId, nonce: c.nonce + 1 }));
  const maxDpr = typeof window === "undefined" ? 1.5 : Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2);
  const label = hovered ?? selectedSlot;

  return (
    <div
      ref={containerRef}
      className={cn("relative isolate overflow-hidden bg-surface-sunken hairline-grid", fullscreen && "bg-background", className)}
      data-testid="bike-viewer"
    >
      {mode === "3d" ? (
        <ViewerErrorBoundary
          fallback={(error) => {
            queueMicrotask(() => setFailed(error.message || "3D model failed to load"));
            return null;
          }}
        >
          <Canvas
            className="!absolute inset-0 touch-none"
            dpr={Math.min(dpr, maxDpr)}
            frameloop={autoRotate ? "always" : "demand"}
            camera={{ position: meta.cameraPresets[0].position, fov: 32, near: 0.05, far: 40 }}
            gl={{ antialias: !lowPower, powerPreference: "high-performance", alpha: true }}
            onPointerMissed={() => interactive && onSelectSlot?.(null)}
            aria-label={`Interactive 3D model — ${meta.label}`}
          >
            <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
            <Suspense fallback={null}>
              <BikeScene
                meta={meta}
                interactive={interactive}
                autoRotate={autoRotate}
                camera={camera}
                focusOnSelect={interactive}
                shadows={!lowPower}
                selectedSlot={selectedSlot}
                hoveredSlot={hovered}
                pendingSlots={pendingSlots}
                recordedSlots={recordedSlots}
                ghostUnrecorded={ghost}
                paintColor={paintColor}
                tireWidthMm={tireWidthMm}
                onHover={setHovered}
                onSelect={(s) => onSelectSlot?.(s)}
              />
            </Suspense>
          </Canvas>
          <LoadingOverlay />
        </ViewerErrorBoundary>
      ) : (
        <div className="absolute inset-0 grid place-items-center p-4 sm:p-8">
          <BikeProfile2D
            selectedSlot={selectedSlot}
            pendingSlots={pendingSlots}
            recordedSlots={recordedSlots}
            paintColor={paintColor}
            onSelectSlot={interactive ? onSelectSlot : undefined}
            className="max-h-full max-w-3xl"
          />
        </div>
      )}

      {/* Status line */}
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-col gap-1.5">
        {meta.placeholder && mode === "3d" && (
          <span className="pointer-events-auto inline-flex w-fit items-center gap-1.5 rounded-sm border border-warning/30 bg-background/80 px-1.5 py-0.5 text-[11px] text-warning backdrop-blur" title={meta.description}>
            <Info className="size-3" /> Placeholder model
          </span>
        )}
        {mode === "2d" && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
            <ScanLine className="size-3" /> {failed ? "3D unavailable — 2D profile" : !webgl ? "WebGL not supported — 2D profile" : "2D profile"}
          </span>
        )}
        {label && interactive && (
          <span className="w-fit rounded-sm bg-background/80 px-1.5 py-0.5 text-xs font-medium backdrop-blur">{SLOT_META[label].label}</span>
        )}
      </div>

      {controls && (
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          {mode === "3d" ? (
            <div className="scrollbar-thin flex min-w-0 gap-1 overflow-x-auto rounded-md border border-border bg-background/85 p-1 backdrop-blur" role="toolbar" aria-label="Camera presets">
              {meta.cameraPresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                    camera.presetId === p.id && "bg-surface-raised text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 gap-1 rounded-md border border-border bg-background/85 p-1 backdrop-blur">
            {mode === "3d" && (
              <>
                <IconButton label="Reset camera" onClick={() => setPreset(meta.defaultPreset)}>
                  <RotateCcw />
                </IconButton>
                {recordedSlots && (
                  <IconButton label={ghost ? "Show all parts" : "Ghost parts not recorded in this build"} active={ghost} onClick={() => setGhost((g) => !g)}>
                    <Ghost />
                  </IconButton>
                )}
              </>
            )}
            {webgl && !failed && (
              <IconButton label={mode === "3d" ? "Switch to 2D profile" : "Switch to 3D view"} onClick={() => setChosenMode(mode === "3d" ? "2d" : "3d")}>
                {mode === "3d" ? <ScanLine /> : <Box />}
              </IconButton>
            )}
            <IconButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize /> : <Expand />}
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-8 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:bg-surface-raised hover:text-foreground [&_svg]:size-4",
        active && "bg-accent-muted text-accent",
      )}
    >
      {children}
    </button>
  );
}
