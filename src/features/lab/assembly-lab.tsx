"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveAssembly, manifestIndex } from "@/lib/assembly/resolve";
import type { AssemblyInput, AssemblySpec, AssetManifest, CategoryTarget, PartInput, Representation } from "@/lib/assembly/spec";
import { CATEGORY_PROFILES } from "@/lib/assembly/conventions";
import { AssemblyView, sourceSignature, type RenderState } from "./assembly-view";
import { SideView } from "./side-view";
import { fetchVerified } from "./asset-loader";

/** Demo components (fictional, like the demo catalogue). Visual bindings + recorded dimensions. */
const FRAMES: Record<string, Omit<PartInput, "slot">> = {
  "frame-road-demo": { name: "VELOX Demo road frame (M)", visual: { kind: "asset", key: "frame-road-demo", version: 1 }, dims: {} },
  "frame-hardtail-demo": { name: 'VELOX Demo 29" hardtail frame (L)', visual: { kind: "asset", key: "frame-hardtail-demo", version: 1 }, dims: {} },
  "frame-no-model": { name: "Demo frame without a 3D model", visual: null, dims: {} },
};
const FORKS: Record<string, Omit<PartInput, "slot">> = {
  "fork-road-demo": { name: "VELOX Demo road fork (370 mm)", visual: { kind: "asset", key: "fork-road-demo", version: 1 }, dims: {} },
  "fork-gravel-demo": { name: "VELOX Demo gravel fork (395 mm)", visual: { kind: "asset", key: "fork-gravel-demo", version: 1 }, dims: {} },
  "fork-mtb-rigid-demo": { name: 'VELOX Demo 29" rigid MTB fork (470 mm)', visual: { kind: "asset", key: "fork-mtb-rigid-demo", version: 1 }, dims: {} },
  "fork-no-model": { name: "Demo fork without a 3D model", visual: null, dims: {} },
};
const WHEEL_SIZES = ["700c", "29", "650b", "missing"] as const;
const TIRE_WIDTHS = ["28", "32", "45", "60", "missing"] as const;

type Config = { category: CategoryTarget; frame: string; fork: string; wheel: (typeof WHEEL_SIZES)[number]; front: (typeof TIRE_WIDTHS)[number]; rear: (typeof TIRE_WIDTHS)[number] };

const PRESETS: Record<string, Config> = {
  road: { category: "road", frame: "frame-road-demo", fork: "fork-road-demo", wheel: "700c", front: "28", rear: "28" },
  hardtail: { category: "mtb_hardtail", frame: "frame-hardtail-demo", fork: "fork-mtb-rigid-demo", wheel: "29", front: "60", rear: "60" },
  gravel: { category: "gravel", frame: "frame-road-demo", fork: "fork-gravel-demo", wheel: "700c", front: "45", rear: "45" },
  folding: { category: "folding", frame: "frame-road-demo", fork: "fork-road-demo", wheel: "700c", front: "28", rear: "28" },
};

export function toInput(c: Config): AssemblyInput {
  const tire = (w: string, slot: "front_tire" | "rear_tire"): PartInput => ({
    slot,
    name: w === "missing" ? "Demo tire (width not recorded)" : `Demo tire ${w} mm`,
    visual: { kind: "generator", generator: "tire", version: 1 },
    dims: { wheel_size: c.wheel === "missing" ? undefined : c.wheel, width_mm: w === "missing" ? undefined : Number(w) },
  });
  return {
    category: c.category,
    parts: {
      frame: { slot: "frame", ...FRAMES[c.frame] },
      fork: { slot: "fork", ...FORKS[c.fork] },
      wheelset: { slot: "wheelset", name: `Demo wheelset ${c.wheel}`, visual: { kind: "generator", generator: "wheel", version: 1 }, dims: { wheel_size: c.wheel === "missing" ? undefined : c.wheel } },
      front_tire: tire(c.front, "front_tire"),
      rear_tire: tire(c.rear, "rear_tire"),
    },
  };
}

const REP_LABEL: Record<Representation, string> = { exact: "Exact", representative: "Representative", generated: "Generated", none: "None" };

declare global {
  interface Window {
    __veloxLab?: unknown;
    __veloxLabSet?: (c: Partial<Config>) => void;
  }
}

export function AssemblyLab({ baseUrl, manifestFile, manifestSha, source, cspMode, enableKtx2 }: { baseUrl: string; manifestFile: string; manifestSha: string; source: string; cspMode: string; enableKtx2: boolean }) {
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config>(PRESETS.road);
  const [render, setRender] = useState<RenderState | null>(null);
  const [csp, setCsp] = useState<string[]>([]);

  useEffect(() => {
    const onViolation = (e: SecurityPolicyViolationEvent) => setCsp((v) => [...v, `${e.violatedDirective} ${e.blockedURI}`]);
    document.addEventListener("securitypolicyviolation", onViolation);
    fetchVerified(baseUrl + manifestFile, manifestSha)
      .then((buf) => setManifest(JSON.parse(new TextDecoder().decode(buf)) as AssetManifest))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, [baseUrl, manifestFile, manifestSha]);

  const index = useMemo(() => (manifest ? manifestIndex(manifest) : new Map()), [manifest]);
  const spec: AssemblySpec | null = useMemo(() => (manifest ? resolveAssembly(toInput(config), manifest) : null), [manifest, config]);

  useEffect(() => {
    window.__veloxLabSet = (c) => setConfig((prev) => ({ ...prev, ...c }));
    window.__veloxLab = spec && {
      config,
      source,
      cspMode,
      fingerprint: spec.fingerprint,
      derived: spec.derived,
      nodes: spec.nodes.map((n) => ({ id: n.id, status: n.status, representation: n.representation, sig: sourceSignature(n), missing: n.missing, warnings: n.warnings })),
      revision: spec.revision,
      render,
      cspViolations: csp,
    };
  }, [spec, render, csp, config, source, cspMode]);

  const set = (patch: Partial<Config>) => setConfig((c) => ({ ...c, ...patch }));
  const select = (label: string, value: string, options: readonly string[] | Record<string, unknown>, onChange: (v: string) => void, id: string) => (
    <label className="flex flex-col gap-1 text-xs" htmlFor={id}>
      <span className="text-muted-foreground">{label}</span>
      <select id={id} data-testid={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 border border-border bg-surface px-2 text-sm">
        {(Array.isArray(options) ? options : Object.keys(options)).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  if (loadError) return <p className="text-sm text-danger" data-testid="lab-error">Manifest could not be loaded: {loadError}</p>;
  if (!spec) return <p className="text-sm text-muted-foreground">Loading verified asset manifest…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        {Object.keys(PRESETS).map((p) => (
          <Button key={p} size="sm" variant="outline" data-testid={`preset-${p}`} onClick={() => setConfig(PRESETS[p])}>
            {CATEGORY_PROFILES[PRESETS[p].category].label} preset
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {select("Category", config.category, Object.keys(CATEGORY_PROFILES), (v) => set({ category: v as CategoryTarget }), "sel-category")}
        {select("Frame", config.frame, FRAMES, (v) => set({ frame: v }), "sel-frame")}
        {select("Fork", config.fork, FORKS, (v) => set({ fork: v }), "sel-fork")}
        {select("Wheel size", config.wheel, WHEEL_SIZES, (v) => set({ wheel: v as Config["wheel"] }), "sel-wheel")}
        {select("Front tire (mm)", config.front, TIRE_WIDTHS, (v) => set({ front: v as Config["front"] }), "sel-front")}
        {select("Rear tire (mm)", config.rear, TIRE_WIDTHS, (v) => set({ rear: v as Config["rear"] }), "sel-rear")}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="h-[460px] min-w-0 border border-border">
          <AssemblyView spec={spec} manifest={index} baseUrl={baseUrl} onState={setRender} enableKtx2={enableKtx2} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SideView spec={spec} />
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-muted-foreground">BB height</dt><dd className="figure">{spec.derived.bbHeightMm ?? "—"} mm</dd></div>
            <div><dt className="text-muted-foreground">Wheelbase</dt><dd className="figure">{spec.derived.wheelbaseMm ?? "—"} mm</dd></div>
            <div><dt className="text-muted-foreground">Frame pitch</dt><dd className="figure">{spec.derived.pitchDeg?.toFixed(2) ?? "—"}°</dd></div>
          </dl>
        </div>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr><th className="p-2">Node</th><th className="p-2">Component</th><th className="p-2">Representation</th><th className="p-2">State</th><th className="p-2">Source / notes</th></tr>
          </thead>
          <tbody>
            {spec.nodes.map((n) => (
              <tr key={n.id} className="border-t border-border align-top" data-testid={`node-${n.id}`}>
                <td className="p-2 font-mono">{n.id}</td>
                <td className="p-2">{n.label}</td>
                <td className="p-2">{REP_LABEL[n.representation]}</td>
                <td className="p-2">
                  {n.status === "ok" ? (render?.rendered[n.id] === sourceSignature(n) ? "Rendered" : "Loading…") : n.status === "missing_dimensions" ? `Unavailable — needs verification: ${n.missing.join(", ")}` : n.status.replace(/_/g, " ")}
                </td>
                <td className="p-2">
                  {n.source?.kind === "asset" && <span className="font-mono">{n.source.key}@{n.source.version} · sha256 {n.source.sha256.slice(0, 12)}</span>}
                  {n.source?.kind === "generator" && (
                    <span>
                      <span className="font-mono">{n.source.generator}@{n.source.version} {JSON.stringify(n.source.params)}</span>
                      {n.source.assumptions.map((a) => <span key={a} className="block text-muted-foreground">{a}</span>)}
                    </span>
                  )}
                  {n.warnings.map((w) => <span key={w} className="block text-warning">{w}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <p>Asset source: <span className="font-mono">{source}</span> · CSP mode: <span className="font-mono">{cspMode}</span></p>
        <p>Geometry decoder: <span className="font-mono" data-testid="lab-decoder">{render?.report?.decoder ?? "pending"}</span> · KTX2: <span className="font-mono">{render?.report?.ktx2 ?? "pending"}</span></p>
        <p>Integrity checks passed: {render?.report?.integrityChecks ?? 0} · failures: {render?.report?.integrityFailures.length ?? 0}</p>
        <p>Decoded geometry = pipeline fingerprint: {render?.report?.fingerprintMatches ?? 0} · mismatches: {render?.report?.fingerprintMismatches.length ?? 0}</p>
        <p>GPU memory: {render?.memory.geometries ?? 0} geometries, {render?.memory.textures ?? 0} textures · cached assets: {render?.cachedAssets.join(", ") || "none"}</p>
        <p>CSP violations on this page: {csp.length}</p>
      </section>
      <pre data-testid="lab-state" className="sr-only">{JSON.stringify({ fingerprint: spec.fingerprint })}</pre>
    </div>
  );
}
