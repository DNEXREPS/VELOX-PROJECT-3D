"use client";
import { projectSide } from "@/lib/assembly/projection2d";
import type { AssemblySpec } from "@/lib/assembly/spec";
import type { BikeSlot } from "@/lib/domain/slots";
import { isBikeSlot } from "@/lib/domain/slots";
import { cn } from "@/lib/utils";

/**
 * 2D side view drawn from the SAME AssemblySpec as the 3D renderer (no separate 2D
 * geometry). Interactive: click a part to select its slot. Also the WebGL fallback.
 */
export function SideView2D({
  spec,
  selectedSlot = null,
  pendingSlots = [],
  onSelectSlot,
  className,
}: {
  spec: AssemblySpec;
  selectedSlot?: BikeSlot | null;
  pendingSlots?: BikeSlot[];
  onSelectSlot?: (slot: BikeSlot | null) => void;
  className?: string;
}) {
  const prims = projectSide(spec);
  const xs: number[] = [];
  const ys: number[] = [0];
  for (const p of prims) {
    if (p.kind === "polyline") {
      for (const [x, y] of p.points) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (p.kind === "circle") {
      xs.push(p.cx - p.r, p.cx + p.r);
      ys.push(p.cy + p.r);
    }
  }
  const minX = Math.min(-0.8, ...xs) - 0.05;
  const maxX = Math.max(0.9, ...xs) + 0.05;
  const maxY = Math.max(1, ...ys) + 0.05;
  const S = 400;
  const X = (x: number) => ((x - minX) * S).toFixed(1);
  const Y = (y: number) => ((maxY - y) * S).toFixed(1);
  const color = (slot: string | null, rep: string) =>
    slot && slot === selectedSlot ? "var(--accent)" : slot && pendingSlots.includes(slot as BikeSlot) ? "var(--info)" : rep === "generated" ? "var(--warning)" : "var(--foreground)";
  const click = (slot: string | null) => (onSelectSlot && isBikeSlot(slot) ? () => onSelectSlot(slot) : undefined);
  return (
    <svg
      data-testid="assembly-2d"
      viewBox={`0 0 ${((maxX - minX) * S).toFixed(0)} ${((maxY + 0.02) * S).toFixed(0)}`}
      className={cn("h-full w-full", className)}
      role="img"
      aria-label="2D side view of the assembled bike"
    >
      <line x1={0} x2={(maxX - minX) * S} y1={Y(0)} y2={Y(0)} stroke="var(--border)" strokeDasharray="6 6" />
      {prims.map((p, i) =>
        p.kind === "polyline" ? (
          <polyline
            key={i}
            data-node={p.nodeId}
            points={p.points.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ") + (p.closed && p.points.length ? ` ${X(p.points[0][0])},${Y(p.points[0][1])}` : "")}
            fill="none"
            stroke={color(p.slot, p.representation)}
            strokeWidth={p.nodeId === "frame" || p.nodeId === "fork" ? 6 : p.nodeId === "chain" ? 1.5 : 3.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            onClick={click(p.slot)}
            className={onSelectSlot ? "cursor-pointer" : undefined}
          />
        ) : p.kind === "circle" ? (
          <circle
            key={i}
            data-node={p.nodeId}
            cx={X(p.cx)}
            cy={Y(p.cy)}
            r={(p.r * S).toFixed(1)}
            fill="none"
            stroke={color(p.slot, p.representation)}
            strokeWidth={p.nodeId.startsWith("tire") ? 6 : 1.8}
            onClick={click(p.slot)}
            className={onSelectSlot ? "cursor-pointer" : undefined}
          />
        ) : null,
      )}
    </svg>
  );
}
