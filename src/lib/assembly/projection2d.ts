/**
 * 2D side projection of an AssemblySpec. The 2D view uses the SAME description as the 3D
 * renderer: node world poses from the resolver, frame/fork outlines from their anchors,
 * and each generator's profile2d() computed from the same params its 3D build uses.
 * There is no separate 2D geometry calculation.
 */
import { FRAME_TEMPLATES } from "./conventions";
import { GENERATORS } from "./generators";
import { transformPoint } from "./math";
import type { AssemblySpec, Representation } from "./spec";

export type Primitive2D =
  | { kind: "polyline"; nodeId: string; slot: string | null; points: [number, number][]; closed?: boolean; representation: Representation }
  | { kind: "circle"; nodeId: string; slot: string | null; cx: number; cy: number; r: number; representation: Representation }
  | { kind: "missing"; nodeId: string; slot: string | null; label: string; reason: string };

export function projectSide(spec: AssemblySpec): Primitive2D[] {
  const out: Primitive2D[] = [];
  const xy = (v: [number, number, number]): [number, number] => [v[0], v[1]];
  for (const n of spec.nodes) {
    if (n.status !== "ok" || !n.world) {
      out.push({ kind: "missing", nodeId: n.id, slot: n.slot, label: n.label, reason: n.status });
      continue;
    }
    if (n.id === "frame") {
      for (const chain of FRAME_TEMPLATES[spec.template].outline2d) {
        const pts = chain.map((id) => n.anchorsWorld[id]).filter(Boolean).map(xy);
        if (pts.length >= 2) out.push({ kind: "polyline", nodeId: n.id, slot: n.slot, points: pts, representation: n.representation });
      }
      continue;
    }
    if (n.id === "fork" && n.anchorsWorld.front_axle) {
      out.push({ kind: "polyline", nodeId: n.id, slot: n.slot, points: [xy(n.world.t), xy(n.anchorsWorld.front_axle)], representation: n.representation });
      continue;
    }
    if (n.source?.kind === "generator") {
      for (const prim of GENERATORS[n.source.generator].profile2d(n.source.params)) {
        if (prim.kind === "circle") {
          const c = transformPoint(n.world, prim.center);
          out.push({ kind: "circle", nodeId: n.id, slot: n.slot, cx: c[0], cy: c[1], r: prim.r, representation: n.representation });
        } else {
          out.push({ kind: "polyline", nodeId: n.id, slot: n.slot, points: prim.points.map((p) => xy(transformPoint(n.world!, p))), closed: prim.closed, representation: n.representation });
        }
      }
    }
  }
  return out;
}

/** @deprecated P0 helper — radii now come from each generator's profile2d(). */
export function projectionRadii(): Record<string, number> {
  return {};
}
