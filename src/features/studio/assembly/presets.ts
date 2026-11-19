import type { AssemblySpec } from "@/lib/assembly/spec";

export interface AssemblyPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * Camera presets computed from the assembled bike (wheelbase, height, cockpit and
 * drivetrain positions) — not hand-placed per model, so a hardtail and a road bike both
 * frame correctly.
 */
export function computePresets(spec: AssemblySpec): AssemblyPreset[] {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const rear = byId.get("wheel_rear")?.world?.t;
  const front = byId.get("wheel_front")?.world?.t;
  const bb = byId.get("frame")?.world?.t ?? [0, 0.28, 0];
  const minX = rear ? rear[0] - 0.4 : -0.75;
  const maxX = front ? front[0] + 0.4 : 0.95;
  const cx = (minX + maxX) / 2;
  const top = Math.max(1, (byId.get("handlebar")?.world?.t[1] ?? byId.get("stem")?.world?.t[1] ?? 0.9) + 0.1);
  const cy = top / 2;
  const span = Math.max(maxX - minX, top);
  const d = span * 1.55;
  const crank = byId.get("crankset")?.world?.t ?? bb;
  const cockpit = byId.get("handlebar")?.world?.t ?? byId.get("stem")?.world?.t ?? [maxX - 0.4, top - 0.1, 0];
  return [
    { id: "three-quarter", label: "3/4", position: [cx + d * 0.42, cy + d * 0.3, d * 0.78], target: [cx, cy * 0.92, 0] },
    { id: "side", label: "Side", position: [cx, cy, d], target: [cx, cy, 0] },
    { id: "non-drive", label: "Non-drive", position: [cx, cy, -d], target: [cx, cy, 0] },
    { id: "front", label: "Front", position: [maxX + d * 0.9, cy + 0.15, 0], target: [cx, cy, 0] },
    { id: "top", label: "Top", position: [cx, top + d * 0.95, 0.01], target: [cx, cy * 0.8, 0] },
    { id: "drivetrain", label: "Drivetrain", position: [crank[0] - 0.2, crank[1] + 0.15, 0.85], target: [crank[0] - 0.2, crank[1], 0.05] },
    { id: "cockpit", label: "Cockpit", position: [cockpit[0] + 0.45, cockpit[1] + 0.3, 0.55], target: [cockpit[0], cockpit[1], 0] },
  ];
}
