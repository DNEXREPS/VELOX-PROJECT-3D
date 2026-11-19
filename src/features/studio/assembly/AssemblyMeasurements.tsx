"use client";
import type { AssemblySpec } from "@/lib/assembly/spec";

const ROWS: { key: keyof AssemblySpec["derived"]; label: string; format: (v: never) => string }[] = [
  { key: "bbHeightMm", label: "BB height", format: (v: number) => `${v.toFixed(1)} mm` },
  { key: "wheelbaseMm", label: "Wheelbase", format: (v: number) => `${v.toFixed(1)} mm` },
  { key: "pitchDeg", label: "Frame pitch", format: (v: number) => `${v.toFixed(2)}°` },
  { key: "lowestPedalMm", label: "Pedal height (crank down)", format: (v: number) => `${v.toFixed(1)} mm` },
  { key: "barClampMm", label: "Bar clamp from BB (x / y)", format: (v: { x: number; y: number }) => `${v.x.toFixed(0)} / ${v.y.toFixed(0)} mm` },
  { key: "saddleClampMm", label: "Seatpost clamp from BB (x / y)", format: (v: { x: number; y: number }) => `${v.x.toFixed(0)} / ${v.y.toFixed(0)} mm` },
];

/** Geometry measurements from the assembly description, each with an honest quality label. */
export function AssemblyMeasurements({ spec }: { spec: AssemblySpec }) {
  const notes = [...new Set(Object.values(spec.derivedQuality).flatMap((q) => q.notes))];
  return (
    <section className="flex flex-col gap-2" data-testid="assembly-measurements">
      <span className="eyebrow">Geometry from the 3D assembly</span>
      <dl className="grid grid-cols-1 gap-1.5 text-xs">
        {ROWS.map((r) => {
          const value = spec.derived[r.key];
          const q = spec.derivedQuality[r.key];
          return (
            <div key={r.key} className="flex items-baseline justify-between gap-3" data-testid={`measure-${r.key}`} data-quality={q?.quality}>
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="figure text-right">
                {value === null ? <span className="text-muted-foreground">Unavailable</span> : (r.format as (v: unknown) => string)(value)}
                {q?.quality === "estimate" && <span className="ml-1.5 rounded-sm bg-warning/15 px-1 text-warning">estimate</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {notes.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {spec.notModelled.length > 0 && <p className="text-xs text-muted-foreground">Data-only in 3D (geometry planned): {spec.notModelled.join(", ").replace(/_/g, " ")}.</p>}
    </section>
  );
}
