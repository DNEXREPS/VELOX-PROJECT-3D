"use client";
import { Box, CircleSlash, Info, TriangleAlert } from "lucide-react";
import type { AssemblyNode, AssemblySpec, Representation } from "@/lib/assembly/spec";
import type { BikeSlot } from "@/lib/domain/slots";
import { MODELLED_SLOTS } from "@/lib/assembly/resolve";

export const REPRESENTATION_LABEL: Record<Representation, string> = {
  exact: "Exact model",
  representative: "Representative model",
  generated: "Generated from recorded dimensions",
  none: "No 3D geometry",
};

const DIM_LABEL: Record<string, string> = {
  bsd_mm: "bead seat diameter",
  width_mm: "width",
  length_mm: "length",
  angle_deg: "angle",
  reach_mm: "reach",
  drop_mm: "drop",
  diameter_mm: "diameter",
  crank_length_mm: "crank length",
  chainrings: "chainring teeth",
  cogs: "cog teeth",
  speeds: "speed count",
};

function statusText(n: AssemblyNode): string {
  switch (n.status) {
    case "ok":
      return REPRESENTATION_LABEL[n.representation];
    case "missing_dimensions":
      return `Unavailable — needs verification: ${n.missing.map((m) => DIM_LABEL[m] ?? m).join(", ")} not recorded`;
    case "no_visual":
      return "No 3D model for this part";
    case "host_unavailable":
      return "Mount point unavailable — the part it attaches to has no geometry";
    case "invalid_binding":
      return "3D model does not fit this bike";
    default:
      return n.status.replace(/_/g, " ");
  }
}

/** Truthful 3D status of a slot: representation, data inputs, display assumptions, gaps. */
export function GeometryStatus({ spec, slot, compact = false }: { spec: AssemblySpec; slot: BikeSlot; compact?: boolean }) {
  const nodes = spec.nodes.filter((n) => n.slot === slot);
  if (nodes.length === 0) {
    const planned = !MODELLED_SLOTS.includes(slot);
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid={`geometry-${slot}`}>
        <Info className="mt-px size-3.5 shrink-0" />
        {planned ? "No 3D geometry for this part type yet (data-only)." : "No part recorded."}
      </p>
    );
  }
  const n = nodes[0];
  const icon = n.status === "ok" ? <Box className="mt-px size-3.5 shrink-0 text-info" /> : n.status === "missing_dimensions" ? <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" /> : <CircleSlash className="mt-px size-3.5 shrink-0" />;
  return (
    <div className="flex flex-col gap-1.5 text-xs" data-testid={`geometry-${slot}`} data-status={n.status} data-representation={n.representation}>
      <p className="flex items-start gap-1.5">
        {icon}
        <span>
          <span className="font-medium">3D: {statusText(n)}</span>
          {n.status === "ok" && n.representation === "representative" && <span className="block text-muted-foreground">Not a model of this exact product.</span>}
        </span>
      </p>
      {!compact && n.status === "ok" && n.source?.kind === "generator" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-5 text-muted-foreground">
          {Object.entries(n.source.params)
            .filter(([k]) => !/^(ring|cog)_[xyz]$/.test(k))
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k.replace(/_/g, " ")}</dt>
                <dd className="figure text-foreground">{Array.isArray(v) ? v.join(", ") : v}</dd>
              </div>
            ))}
        </dl>
      )}
      {!compact && n.source?.kind === "generator" && n.source.assumptions.length > 0 && (
        <ul className="list-disc pl-9 text-muted-foreground">
          {n.source.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {!compact && n.warnings.length > 0 && (
        <ul className="pl-5 text-warning">
          {n.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
