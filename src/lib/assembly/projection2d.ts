/**
 * 2D side projection of an AssemblySpec — the fallback view uses the SAME description as
 * the 3D renderer, so a replacement changes the 2D drawing too (wheel/tire size, fork
 * length, frame geometry, pitch). Output is renderer-agnostic primitives in metres
 * (x forward, y up); the caller maps them to SVG.
 */
import { FRAME_TEMPLATES } from "./conventions";
import type { AssemblySpec, Representation } from "./spec";

export type Primitive2D =
  | { kind: "polyline"; nodeId: string; points: [number, number][]; representation: Representation }
  | { kind: "circle"; nodeId: string; cx: number; cy: number; r: number; representation: Representation }
  | { kind: "missing"; nodeId: string; label: string; reason: string };

export function projectSide(spec: AssemblySpec, radii: Record<string, number>): Primitive2D[] {
  const out: Primitive2D[] = [];
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const xy = (v: [number, number, number]): [number, number] => [v[0], v[1]];

  const frame = byId.get("frame");
  if (frame?.status === "ok") {
    for (const chain of FRAME_TEMPLATES[spec.template].outline2d) {
      const pts = chain.map((id) => frame.anchorsWorld[id]).filter(Boolean).map(xy);
      if (pts.length >= 2) out.push({ kind: "polyline", nodeId: "frame", points: pts, representation: frame.representation });
    }
  }
  const fork = byId.get("fork");
  if (fork?.status === "ok" && fork.world && fork.anchorsWorld.front_axle) {
    out.push({ kind: "polyline", nodeId: "fork", points: [xy(fork.world.t), xy(fork.anchorsWorld.front_axle)], representation: fork.representation });
  }
  for (const id of ["wheel_rear", "wheel_front", "tire_rear", "tire_front"]) {
    const n = byId.get(id);
    if (!n) continue;
    if (n.status === "ok" && n.world && radii[id]) {
      out.push({ kind: "circle", nodeId: id, cx: n.world.t[0], cy: n.world.t[1], r: radii[id], representation: n.representation });
    }
  }
  for (const n of spec.nodes) {
    if (n.status !== "ok") out.push({ kind: "missing", nodeId: n.id, label: n.label, reason: n.status });
  }
  return out;
}

/** Radii needed by the projection, from generator params in the spec. */
export function projectionRadii(spec: AssemblySpec): Record<string, number> {
  const radii: Record<string, number> = {};
  for (const n of spec.nodes) {
    if (n.status !== "ok" || n.source?.kind !== "generator") continue;
    const p = n.source.params;
    radii[n.id] = n.source.generator === "tire" ? (p.bsd_mm / 2 + p.height_mm) / 1000 : p.bsd_mm / 2000;
  }
  return radii;
}
