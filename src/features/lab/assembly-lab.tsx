"use client";
/**
 * Assembly lab — backend-free harness for the PRODUCTION modular renderer (P1). Uses the
 * same AssemblyCanvas, SideView2D, GeometryStatus, measurements, resolver and temporary
 * demo links as the studio, so WebKit/iPhone/iPad CI covers the studio rendering path.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveAssembly, manifestIndex } from "@/lib/assembly/resolve";
import type { AssemblySpec, AssetManifest, CategoryTarget } from "@/lib/assembly/spec";
import { CATEGORY_PROFILES } from "@/lib/assembly/conventions";
import { BIKE_SLOTS, SLOT_META, type BikeSlot } from "@/lib/domain/slots";
import { AssemblyCanvas, sourceSignature, type RenderState } from "@/features/studio/assembly/AssemblyCanvas";
import { SideView2D } from "@/features/studio/assembly/SideView2D";
import { GeometryStatus } from "@/features/studio/assembly/GeometryStatus";
import { AssemblyMeasurements } from "@/features/studio/assembly/AssemblyMeasurements";
import { fetchVerified } from "@/features/studio/assembly/asset-loader";
import { labPartsFor } from "./lab-parts";
import { LAB_PRESETS, labInput, type LabConfig } from "./lab-config";

declare global {
  interface Window {
    __veloxLab?: unknown;
    __veloxLabSet?: (patch: { category?: CategoryTarget; parts?: Partial<Record<BikeSlot, string | null>>; preset?: string }) => void;
  }
}

export function AssemblyLab({ baseUrl, manifestFile, manifestSha, source, cspMode, enableKtx2 }: { baseUrl: string; manifestFile: string; manifestSha: string; source: string; cspMode: string; enableKtx2: boolean }) {
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<LabConfig>(LAB_PRESETS.road);
  const [render, setRender] = useState<RenderState | null>(null);
  const [csp, setCsp] = useState<string[]>([]);
  const [selected, setSelected] = useState<BikeSlot | null>(null);

  useEffect(() => {
    const onViolation = (e: SecurityPolicyViolationEvent) => setCsp((v) => [...v, `${e.violatedDirective} ${e.blockedURI}`]);
    document.addEventListener("securitypolicyviolation", onViolation);
    fetchVerified(baseUrl + manifestFile, manifestSha)
      .then((buf) => setManifest(JSON.parse(new TextDecoder().decode(buf)) as AssetManifest))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, [baseUrl, manifestFile, manifestSha]);

  const index = useMemo(() => (manifest ? manifestIndex(manifest) : new Map()), [manifest]);
  const spec: AssemblySpec | null = useMemo(() => (manifest ? resolveAssembly(labInput(config), manifest) : null), [manifest, config]);

  useEffect(() => {
    window.__veloxLabSet = (patch) =>
      setConfig((prev) => (patch.preset ? LAB_PRESETS[patch.preset] : { category: patch.category ?? prev.category, parts: { ...prev.parts, ...(patch.parts ?? {}) } }));
    window.__veloxLab = spec && {
      config,
      source,
      cspMode,
      fingerprint: spec.fingerprint,
      derived: spec.derived,
      derivedQuality: spec.derivedQuality,
      nodes: spec.nodes.map((n) => ({ id: n.id, slot: n.slot, status: n.status, representation: n.representation, sig: sourceSignature(n), missing: n.missing, warnings: n.warnings })),
      revision: spec.revision,
      render,
      cspViolations: csp,
    };
  }, [spec, render, csp, config, source, cspMode]);

  if (loadError) return <p className="text-sm text-danger" data-testid="lab-error">Manifest could not be loaded: {loadError}</p>;
  if (!spec) return <p className="text-sm text-muted-foreground">Loading verified asset manifest…</p>;

  const slots = BIKE_SLOTS.filter((s) => labPartsFor(s).length > 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        {Object.entries(LAB_PRESETS).map(([id, p]) => (
          <Button key={id} size="sm" variant="outline" data-testid={`preset-${id}`} onClick={() => setConfig(p)}>
            {CATEGORY_PROFILES[p.category].label} preset
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {slots.map((slot) => (
          <label key={slot} className="flex min-w-0 flex-col gap-1 text-xs" htmlFor={`sel-${slot}`}>
            <span className="text-muted-foreground">{SLOT_META[slot].label}</span>
            <select
              id={`sel-${slot}`}
              data-testid={`sel-${slot}`}
              value={config.parts[slot] ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, parts: { ...c.parts, [slot]: e.target.value || null } }))}
              className="h-8 min-w-0 border border-border bg-surface px-2 text-sm"
            >
              <option value="">— none —</option>
              {labPartsFor(slot).map((p) => (
                <option key={p.key} value={p.key}>{p.part.name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="relative h-[460px] min-w-0 border border-border bg-surface-sunken">
          <AssemblyCanvas className="!absolute inset-0" spec={spec} manifest={index} baseUrl={baseUrl} onState={setRender} enableKtx2={enableKtx2} selectedSlot={selected} onSelectSlot={setSelected} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="h-56 border border-border bg-surface-sunken p-2">
            <SideView2D spec={spec} selectedSlot={selected} onSelectSlot={setSelected} />
          </div>
          <AssemblyMeasurements spec={spec} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => (
          <div key={slot} className="border border-border p-2" data-testid={`node-${slot}`}>
            <p className="text-xs font-medium">{SLOT_META[slot].label}</p>
            <GeometryStatus spec={spec} slot={slot} />
          </div>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <p>Asset source: <span className="font-mono">{source}</span> · CSP mode: <span className="font-mono">{cspMode}</span></p>
        <p>Geometry decoder: <span className="font-mono" data-testid="lab-decoder">{render?.report?.decoder ?? "pending"}</span> · KTX2: <span className="font-mono">{render?.report?.ktx2 ?? "pending"}</span></p>
        <p>Integrity checks passed: {render?.report?.integrityChecks ?? 0} · failures: {render?.report?.integrityFailures.length ?? 0}</p>
        <p>Decoded geometry = pipeline fingerprint: {render?.report?.fingerprintMatches ?? 0} · mismatches: {render?.report?.fingerprintMismatches.length ?? 0}</p>
        <p>Cached assets: {render?.cachedAssets.join(", ") || "none"} · CSP violations on this page: {csp.length}</p>
      </section>
    </div>
  );
}
