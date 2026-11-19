"use client";
import { projectSide, projectionRadii } from "@/lib/assembly/projection2d";
import type { AssemblySpec } from "@/lib/assembly/spec";

/** 2D fallback drawn from the SAME AssemblySpec as the 3D view. */
export function SideView({ spec }: { spec: AssemblySpec }) {
  const prims = projectSide(spec, projectionRadii(spec));
  const xs: number[] = [];
  const ys: number[] = [0];
  for (const p of prims) {
    if (p.kind === "polyline") p.points.forEach(([x, y]) => (xs.push(x), ys.push(y)));
    if (p.kind === "circle") {
      xs.push(p.cx - p.r, p.cx + p.r);
      ys.push(p.cy + p.r);
    }
  }
  const minX = Math.min(-0.8, ...xs) - 0.05;
  const maxX = Math.max(0.9, ...xs) + 0.05;
  const maxY = Math.max(1, ...ys) + 0.05;
  const S = 400;
  const X = (x: number) => (x - minX) * S;
  const Y = (y: number) => (maxY - y) * S;
  const stroke = (rep: string) => (rep === "generated" ? "var(--warning)" : "var(--foreground)");
  const missing = prims.filter((p) => p.kind === "missing");
  return (
    <figure className="flex flex-col gap-2">
      <svg data-testid="lab-2d" viewBox={`0 0 ${(maxX - minX) * S} ${(maxY + 0.02) * S}`} className="w-full border border-border bg-surface-sunken" role="img" aria-label="2D side projection of the assembly">
        <line x1={0} x2={(maxX - minX) * S} y1={Y(0)} y2={Y(0)} stroke="var(--border)" strokeDasharray="6 6" />
        {prims.map((p, i) =>
          p.kind === "polyline" ? (
            <polyline key={i} data-node={p.nodeId} points={p.points.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")} fill="none" stroke={stroke(p.representation)} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
          ) : p.kind === "circle" ? (
            <circle key={i} data-node={p.nodeId} cx={X(p.cx).toFixed(1)} cy={Y(p.cy).toFixed(1)} r={(p.r * S).toFixed(1)} fill="none" stroke={stroke(p.representation)} strokeWidth={p.nodeId.startsWith("tire") ? 6 : 2} />
          ) : null,
        )}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        2D projection of the same assembly description. Amber = generated from dimensions.
        {missing.length > 0 && ` Not drawn: ${missing.map((m) => `${m.nodeId} (${m.reason.replace(/_/g, " ")})`).join(", ")}.`}
      </figcaption>
    </figure>
  );
}
