"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsDown, ChevronsUp, ListTree, Save, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FormMessage } from "@/components/common/form";
import { LazyBikeViewer } from "../three/LazyBikeViewer";
import { getModelMeta, slotHasGeometry } from "../models/registry";
import { buildChanges, previewParts, type PendingAction, type PendingMap } from "@/lib/configuration";
import { checkCompatibility, checkConfiguration, type CompatibilityStatus } from "@/lib/compatibility";
import { BIKE_SLOTS, SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { applyConfiguration } from "@/server/actions/configuration";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { InstalledPart } from "@/types/domain";
import { cn } from "@/lib/utils";
import { resolveAssembly, manifestIndex } from "@/lib/assembly/resolve";
import type { AssemblyInput, AssemblySpec } from "@/lib/assembly/spec";
import { ENGINE_ENABLED, setViewerChoice, useVerifiedManifest, useViewerChoice, type ManifestRef } from "../assembly/engine";
import { engineTarget, toPartInput } from "../assembly/demo-bindings";
import { ModularViewer } from "../assembly/ModularViewer";
import { GeometryStatus } from "../assembly/GeometryStatus";
import { AssemblyMeasurements } from "../assembly/AssemblyMeasurements";
import { PartPanel } from "./part-panel";
import { SlotList } from "./slot-list";
import { CompatBadge } from "./compat-badge";

interface Props {
  bikeId: string;
  modelKey: string;
  category: string;
  paintColor: string | null;
  installed: InstalledPart[];
  initialSlot?: BikeSlot | null;
  manifestRef: ManifestRef | null;
}

/** Resolver input for the configuration: installed parts with pending changes applied. */
function assemblyInput(category: AssemblyInput["category"], installed: InstalledPart[], pending: PendingMap): AssemblyInput {
  const parts: AssemblyInput["parts"] = {};
  for (const p of installed) parts[p.slot] = toPartInput(p.slot, p, p.custom);
  for (const [slot, action] of Object.entries(pending) as [BikeSlot, PendingAction][]) {
    if (action.kind === "remove") delete parts[slot];
    else if (action.kind === "custom") parts[slot] = toPartInput(slot, { componentSlug: null, name: action.name, specs: [], attributes: {} }, true);
    else parts[slot] = toPartInput(slot, { componentSlug: action.component.slug, name: action.component.name, specs: action.component.specs, attributes: action.component.attributes });
  }
  return { category, parts };
}

export function StudioClient({ bikeId, modelKey, category, paintColor, installed, initialSlot = null, manifestRef }: Props) {
  const router = useRouter();
  const meta = getModelMeta(modelKey);
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [selected, setSelected] = useState<BikeSlot | null>(initialSlot);
  const [mode, setMode] = useState<"detail" | "replace">("detail");
  const [pending, setPending] = useState<PendingMap>({});
  const [description, setDescription] = useState("");
  const [slotsOpen, setSlotsOpen] = useState(false);
  /** Phones/tablets: the part sheet opens compact so the viewer and its controls stay visible above it. */
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string; revision?: number } | null>(null);

  // Desktop: fill the viewport below the page chrome (measured, not hard-coded).
  const rootRef = useRef<HTMLDivElement>(null);
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = rootRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        setFillHeight(Math.max(560, Math.floor(window.innerHeight - top)));
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, []);

  const installedMap = useMemo(() => new Map(installed.map((p) => [p.slot, p])), [installed]);

  // ---- Modular assembly engine (feature switch; classic viewer stays available) ----
  const choice = useViewerChoice();
  const target = engineTarget(category);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const wantModular = ENGINE_ENABLED && choice === "modular";
  const { manifest, error: manifestError } = useVerifiedManifest(wantModular && target ? manifestRef : null);
  const manifestMap = useMemo(() => (manifest ? manifestIndex(manifest) : null), [manifest]);
  const savedSpec: AssemblySpec | null = useMemo(() => (manifest && target ? resolveAssembly(assemblyInput(target, installed, {}), manifest) : null), [manifest, target, installed]);
  const previewSpec: AssemblySpec | null = useMemo(() => (manifest && target ? resolveAssembly(assemblyInput(target, installed, pending), manifest) : null), [manifest, target, installed, pending]);
  const modular = wantModular && !!target && !!previewSpec && !!savedSpec && !!manifestMap && !fallbackReason;
  const engineNotice = !wantModular
    ? null
    : !target
      ? `Modular 3D isn't available for ${category.replace(/_/g, " ")} bikes yet — showing the classic viewer.`
      : manifestError || (!manifestRef && "3D asset manifest unavailable")
        ? "3D assets could not be verified — showing the classic viewer."
        : fallbackReason
          ? `The modular viewer stopped (${fallbackReason}) — showing the classic viewer.`
          : null;

  const geometrySlots = useMemo(
    () => (modular && previewSpec ? new Set(previewSpec.nodes.filter((n) => n.status === "ok" && n.slot).map((n) => n.slot as BikeSlot)) : new Set(BIKE_SLOTS.filter((s) => slotHasGeometry(meta, s)))),
    [modular, previewSpec, meta],
  );
  const changes = useMemo(() => buildChanges(installed, pending), [installed, pending]);
  const pendingSlots = useMemo(() => Object.keys(pending) as BikeSlot[], [pending]);

  /** Configuration around `slot` with every OTHER pending change applied. */
  const contextFor = useCallback(
    (slot: BikeSlot) => {
      const rest = { ...pending };
      delete rest[slot];
      return previewParts(installed, rest).filter((p) => p.slot !== slot);
    },
    [installed, pending],
  );

  // Whole-build check (with pending changes applied), aggregated per slot.
  const preview = useMemo(() => previewParts(installed, pending), [installed, pending]);
  const buildChecks = useMemo(() => checkConfiguration(preview), [preview]);
  const issues = useMemo(() => {
    const map: Partial<Record<BikeSlot, CompatibilityStatus>> = {};
    for (const p of preview) {
      const r = checkCompatibility(p, preview.filter((x) => x.slot !== p.slot));
      if (r.checks.length) map[p.slot] = r.status;
    }
    return map;
  }, [preview]);
  const incompatible = buildChecks.filter((c) => c.status === "incompatible").length;
  const unknown = buildChecks.filter((c) => c.status === "unknown").length;

  // Parametric 3D preview inputs derived from data (installed or pending).
  const tireWidth = (slot: "front_tire" | "rear_tire") => {
    const p = pending[slot];
    if (p?.kind === "replace") return p.component.attributes.tire_width_mm as number | undefined;
    if (p) return undefined;
    return installedMap.get(slot)?.attributes.tire_width_mm as number | undefined;
  };
  const recordedSlots = useMemo(
    () => BIKE_SLOTS.filter((s) => (installedMap.has(s) && pending[s]?.kind !== "remove") || (pending[s] && pending[s]!.kind !== "remove")),
    [installedMap, pending],
  );

  const select = (slot: BikeSlot | null) => {
    setSelected(slot);
    setMode("detail");
    setSlotsOpen(false);
    setSheetExpanded(false);
  };

  // Narrow screens: once a part is selected (and the Parts list has closed and released its
  // scroll lock), bring the viewer and its toolbar to the top, above the compact sheet.
  useEffect(() => {
    if (isDesktop || !selected || slotsOpen) return;
    const t = window.setTimeout(() => rootRef.current?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
  }, [isDesktop, selected, slotsOpen]);

  const setPendingFor = (slot: BikeSlot, action: PendingAction | null) => {
    setMessage(null);
    setPending((prev) => {
      const next = { ...prev };
      if (action) next[slot] = action;
      else delete next[slot];
      return next;
    });
  };

  const save = () =>
    startSave(async () => {
      const res = await applyConfiguration({ bicycleId: bikeId, description: description || undefined, changes });
      if (!res.ok) return setMessage({ kind: "error", text: res.error });
      setPending({});
      setDescription("");
      setMode("detail");
      setMessage({ kind: "success", text: res.message ?? "Saved.", revision: res.data.revision });
      router.refresh();
    });

  const panel = selected ? (
    <PartPanel
      slot={selected}
      installed={installedMap.get(selected) ?? null}
      pending={pending[selected]}
      context={contextFor(selected)}
      meta={meta}
      mode={mode}
      onModeChange={setMode}
      onPending={(a) => setPendingFor(selected, a)}
      onClose={() => select(null)}
      geometry={modular && savedSpec && previewSpec ? { saved: <GeometryStatus spec={savedSpec} slot={selected} />, preview: <GeometryStatus spec={previewSpec} slot={selected} /> } : undefined}
    />
  ) : (
    <BuildOverview installedCount={installed.length} incompatible={incompatible} unknown={unknown} checks={buildChecks.length} measurements={modular && previewSpec ? <AssemblyMeasurements spec={previewSpec} /> : null} />
  );

  const pendingCount = Object.keys(pending).length;
  const viewerClass = cn(
    "lg:h-auto lg:flex-1",
    // With the compact sheet open (45dvh), the viewer fits the space above it: 55dvh minus the
    // sticky site header (3.5rem) and the viewer switch bar (~2.25rem).
    !isDesktop && selected ? "h-[calc(55dvh-5.75rem)] min-h-[200px]" : "h-[58dvh] min-h-[340px]",
  );
  /** Pending changes bar. `compact` (inside the collapsed part sheet) leaves out the description field. */
  const pendingBar = (className: string, compact = false) =>
    pendingCount > 0 || message ? (
          <div className={className}>
            {message && (
              <div className="mb-2">
                <FormMessage kind={message.kind}>
                  {message.text}{" "}
                  {message.revision && (
                    <Link href={`/garage/${bikeId}/history`} className="underline">View history</Link>
                  )}
                </FormMessage>
              </div>
            )}
            {pendingCount > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="figure shrink-0 rounded-sm bg-info/15 px-1.5 text-info">{pendingCount}</span>
                  <span className="truncate text-muted-foreground">
                    pending: {(Object.keys(pending) as BikeSlot[]).map((s) => SLOT_META[s].short).join(", ")}
                  </span>
                  {incompatible > 0 && <CompatBadge status="incompatible" />}
                </div>
                {!compact && (
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this change (optional)"
                  maxLength={500}
                  className="sm:ml-auto sm:max-w-72"
                  aria-label="Change description"
                />
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setPending({}); setMessage(null); }} disabled={saving}>
                    <Undo2 /> Cancel all
                  </Button>
                  <Button variant="primary" size="sm" onClick={save} disabled={saving || changes.length === 0}>
                    <Save /> {saving ? "Saving…" : "Save revision"}
                  </Button>
                </div>
              </div>
            )}
          </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      // Narrow screens with the part sheet open: room below the studio so it can scroll to the top.
      className={cn("flex scroll-mt-14 flex-col lg:flex-row", !isDesktop && selected && (sheetExpanded ? "pb-[85dvh]" : "pb-[45dvh]"))}
      style={isDesktop && fillHeight ? { height: fillHeight } : undefined}>
      {/* Slot list: column on desktop, sheet on tablet/mobile */}
      <aside className="scrollbar-thin hidden w-64 shrink-0 overflow-y-auto border-r border-border py-3 lg:block">
        <SlotList installed={installedMap} pending={pending} issues={issues} selected={selected} onSelect={select} geometrySlots={geometrySlots} />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {ENGINE_ENABLED && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs" data-testid="viewer-switch">
            <span className="text-muted-foreground">Viewer</span>
            {(["modular", "classic"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={choice === v}
                onClick={() => {
                  setFallbackReason(null);
                  setViewerChoice(v);
                }}
                className={cn("rounded-sm border px-2 py-0.5", choice === v ? "border-accent text-accent" : "border-border text-muted-foreground")}
              >
                {v === "modular" ? "Modular (beta)" : "Classic"}
              </button>
            ))}
            {engineNotice && <span className="text-warning" role="status" data-testid="engine-notice">{engineNotice}</span>}
          </div>
        )}
        {modular && previewSpec && savedSpec && manifestMap && manifestRef ? (
          <ModularViewer
            spec={previewSpec}
            savedSpec={savedSpec}
            manifest={manifestMap}
            baseUrl={manifestRef.baseUrl}
            selectedSlot={selected}
            pendingSlots={pendingSlots}
            paintColor={paintColor}
            onSelectSlot={select}
            onFallback={setFallbackReason}
            className={viewerClass}
          />
        ) : wantModular && target && !engineNotice ? (
          <div className={cn("grid place-items-center", viewerClass)} role="status">
            <span className="eyebrow">Verifying 3D assets…</span>
          </div>
        ) : (
          <LazyBikeViewer
            modelKey={modelKey}
            selectedSlot={selected}
            onSelectSlot={select}
            pendingSlots={pendingSlots}
            recordedSlots={recordedSlots}
            paintColor={paintColor}
            tireWidthMm={{ front: tireWidth("front_tire"), rear: tireWidth("rear_tire") }}
            className={viewerClass}
          />
        )}
        <div className="absolute right-3 top-3 lg:hidden">
          <Button size="sm" variant="secondary" onClick={() => setSlotsOpen(true)}>
            <ListTree /> Parts
          </Button>
        </div>

        {/* Pending changes bar: confirm or cancel (inside the part sheet while it is open on narrow screens) */}
        {(isDesktop || !selected) && pendingBar("sticky bottom-0 z-10 border-t border-border bg-surface px-3 py-3 sm:px-4 lg:static")}
      </div>

      {/* Context panel: right column on desktop, bottom sheet on smaller screens */}
      {isDesktop ? (
        <aside className="scrollbar-thin w-[380px] shrink-0 overflow-y-auto border-l border-border p-4">{panel}</aside>
      ) : (
        <>
          {!selected && <div className="border-t border-border p-4">{panel}</div>}
          <Sheet open={!!selected} onOpenChange={(o) => !o && select(null)} modal={false}>
            <SheetContent
              side="bottom"
              hideClose
              className={cn("overflow-hidden p-0 pt-2", sheetExpanded ? "max-h-[85dvh]" : "max-h-[45dvh]")}
              onInteractOutside={(e) => e.preventDefault()}
              data-testid="part-sheet"
              data-expanded={sheetExpanded}
            >
              <SheetTitle className="sr-only">{selected ? SLOT_META[selected].label : "Component"}</SheetTitle>
              <SheetDescription className="sr-only">Component details and replacement options</SheetDescription>
              <div className="flex shrink-0 justify-end px-4">
                <button
                  type="button"
                  onClick={() => setSheetExpanded((v) => !v)}
                  aria-expanded={sheetExpanded}
                  className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="sheet-toggle"
                >
                  {sheetExpanded ? <ChevronsDown className="size-3.5" /> : <ChevronsUp className="size-3.5" />}
                  {sheetExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              {/* Only the panel scrolls; the toggle above and the pending bar below stay in view. */}
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">{selected && panel}</div>
              {pendingBar("shrink-0 border-t border-border bg-surface px-4 py-2", !sheetExpanded)}
            </SheetContent>
          </Sheet>
        </>
      )}

      <Sheet open={slotsOpen} onOpenChange={setSlotsOpen}>
        <SheetContent side="left" className="py-4">
          <SheetTitle className="px-4">Components</SheetTitle>
          <SheetDescription className="sr-only">Select a component position</SheetDescription>
          <div className="mt-2">
            <SlotList installed={installedMap} pending={pending} issues={issues} selected={selected} onSelect={select} geometrySlots={geometrySlots} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BuildOverview({ installedCount, incompatible, unknown, checks, measurements }: { installedCount: number; incompatible: number; unknown: number; checks: number; measurements?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-4")}>
      <div>
        <span className="eyebrow">Build check</span>
        <h2 className="text-base font-semibold">Configuration</h2>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">Parts recorded</dt><dd className="figure">{installedCount}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Checks evaluated</dt><dd className="figure">{checks}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Incompatible</dt><dd className={cn("figure", incompatible && "text-danger")}>{incompatible}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Need verification</dt><dd className={cn("figure", unknown && "text-warning")}>{unknown}</dd></div>
      </dl>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-px size-3.5 shrink-0" />
        Select a part on the model or in the list. Replacements are previewed first and only saved — as a new build revision — when you confirm.
      </p>
      {measurements}
    </div>
  );
}
