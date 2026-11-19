/**
 * resolveAssembly(): configuration → AssemblySpec. Pure and deterministic.
 *
 * Inputs are the components (installed or pending), their visual bindings and recorded
 * dimensions, plus the asset manifest (declarations only — no GLB parsing). The output
 * is the single description consumed by the 3D renderer, the 2D fallback, the tests
 * and build revisions.
 *
 * P0 prototype scope: frame, fork, wheelset (front + rear), front/rear tire.
 * The compatibility engine stays the authority on compatibility; mismatches found here
 * are reported as warnings and the parts are still rendered as configured.
 */
import * as THREE from "three";
import type { BikeSlot } from "@/lib/domain/slots";
import { CATEGORY_PROFILES, FRAME_TEMPLATES, ISO_BSD_MM, TOLERANCE } from "./conventions";
import { GENERATOR_VERSIONS, resolveTire, resolveWheel, type GeneratorResolution } from "./generators";
import { hash64, round, stableStringify } from "./fingerprint";
import { attachPose, IDENTITY, multiply, transformPoint } from "./math";
import {
  ASSEMBLY_SPEC,
  type AnchorDecl,
  type AssemblyInput,
  type AssemblyNode,
  type AssemblySpec,
  type AssetManifest,
  type ManifestEntry,
  type MountDecl,
  type NodeStatus,
  type PartInput,
  type Pose,
  type RevisionVisualRef,
  type Vec3,
} from "./spec";

export const PROTOTYPE_SLOTS: BikeSlot[] = ["frame", "fork", "wheelset", "front_tire", "rear_tire"];

interface Resolved {
  node: AssemblyNode;
  anchors: Record<string, AnchorDecl>;
  mounts: Record<string, MountDecl>;
  outerRadiusM?: number;
  gen?: GeneratorResolution;
}

export function manifestIndex(manifest: AssetManifest): Map<string, ManifestEntry> {
  return new Map(manifest.assets.map((a) => [`${a.key}@${a.version}`, a]));
}

/** Map catalog wheel-size values ("700c", "29", …) or explicit bsd_mm to ISO bead seat diameter. */
export function bsdFromDims(dims: PartInput["dims"]): number | null {
  const explicit = dims.bsd_mm;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  const size = typeof dims.wheel_size === "string" ? dims.wheel_size.toLowerCase().replace(/["”]/g, "") : null;
  return size && ISO_BSD_MM[size] ? ISO_BSD_MM[size] : null;
}

function emptyNode(id: string, slot: BikeSlot | null, label: string, status: NodeStatus, extra: Partial<AssemblyNode> = {}): AssemblyNode {
  return { id, slot, label, representation: "none", status, source: null, attach: null, local: null, world: null, anchorsWorld: {}, missing: [], warnings: [], ...extra };
}

function resolveAssetPart(id: string, part: PartInput | undefined, index: Map<string, ManifestEntry>, expectKind: ManifestEntry["kind"]): Resolved {
  if (!part) return { node: emptyNode(id, slotFor(id), "Not recorded", "no_visual"), anchors: {}, mounts: {} };
  if (!part.visual) return { node: emptyNode(id, part.slot, part.name, "no_visual"), anchors: {}, mounts: {} };
  if (part.visual.kind !== "asset") return { node: emptyNode(id, part.slot, part.name, "invalid_binding", { warnings: [`${id}: generator binding not supported for ${expectKind}`] }), anchors: {}, mounts: {} };
  const entry = index.get(`${part.visual.key}@${part.visual.version}`);
  if (!entry || entry.kind !== expectKind) {
    return { node: emptyNode(id, part.slot, part.name, "invalid_binding", { warnings: [`${id}: asset ${part.visual.key}@${part.visual.version} is not an approved ${expectKind} asset`] }), anchors: {}, mounts: {} };
  }
  return {
    node: emptyNode(id, part.slot, part.name, "ok", {
      representation: entry.representation,
      source: { kind: "asset", key: entry.key, version: entry.version, sha256: entry.sha256, file: entry.file },
    }),
    anchors: entry.anchors,
    mounts: entry.mounts,
  };
}

function slotFor(id: string): BikeSlot | null {
  if (id === "frame" || id === "fork") return id;
  if (id.startsWith("wheel_")) return "wheelset";
  if (id === "tire_front") return "front_tire";
  if (id === "tire_rear") return "rear_tire";
  return null;
}

function resolveGenerated(id: string, part: PartInput | undefined, kind: "wheel" | "tire", position: "front" | "rear"): Resolved {
  if (!part) return { node: emptyNode(id, slotFor(id), "Not recorded", "no_visual"), anchors: {}, mounts: {} };
  if (!part.visual) return { node: emptyNode(id, part.slot, part.name, "no_visual"), anchors: {}, mounts: {} };
  if (part.visual.kind !== "generator" || part.visual.generator !== kind) {
    return { node: emptyNode(id, part.slot, part.name, "invalid_binding", { warnings: [`${id}: expected the ${kind} generator`] }), anchors: {}, mounts: {} };
  }
  const bsd = bsdFromDims(part.dims);
  const dims = { ...part.dims, bsd_mm: bsd ?? undefined, width_mm: part.dims.width_mm ?? part.dims.tire_width_mm };
  const gen = kind === "wheel" ? resolveWheel(dims, position) : resolveTire(dims);
  if (!gen.ok) {
    // Never guess: a part without its required dimensions has no geometry and says why.
    return { node: emptyNode(id, part.slot, part.name, "missing_dimensions", { missing: gen.missing }), anchors: {}, mounts: {} };
  }
  return {
    node: emptyNode(id, part.slot, part.name, "ok", {
      representation: "generated",
      source: { kind: "generator", generator: kind, version: GENERATOR_VERSIONS[kind], params: gen.params, assumptions: gen.assumptions },
    }),
    anchors: gen.anchors,
    mounts: gen.mounts,
    outerRadiusM: gen.outerRadiusM,
    gen,
  };
}

/** Attach `child` to `host` at anchor/mount; marks host_unavailable if impossible. */
function attach(child: Resolved, host: Resolved, anchorId: string, mountId: string, slide = 0, angle = 0): void {
  if (child.node.status !== "ok") return;
  const anchor = host.anchors[anchorId];
  const mount = child.mounts[mountId];
  if (host.node.status !== "ok" || !anchor) {
    child.node.status = "host_unavailable";
    child.node.warnings.push(`${child.node.id}: host ${host.node.id} has no usable anchor ${anchorId}`);
    return;
  }
  if (!mount) {
    child.node.status = "invalid_binding";
    child.node.warnings.push(`${child.node.id}: missing mount ${mountId}`);
    return;
  }
  if (anchor.type !== mount.type) child.node.warnings.push(`${child.node.id}: interface type ${mount.type} does not match anchor ${anchorId} (${anchor.type})`);
  if (anchor.standard && mount.standard && anchor.standard !== mount.standard) {
    child.node.warnings.push(`interface_mismatch:${anchorId}: part ${mount.standard} ≠ host ${anchor.standard}`);
  }
  if (anchor.slide && (slide < anchor.slide.min - 1e-9 || slide > anchor.slide.max + 1e-9)) {
    child.node.warnings.push(`${child.node.id}: slide ${slide} outside ${anchor.slide.min}…${anchor.slide.max} at ${anchorId}`);
  }
  child.node.attach = { parent: host.node.id, anchor: anchorId, mount: mountId, slide, angle };
  child.node.local = attachPose(anchor.pose, mount.pose, slide, angle);
}

export function resolveAssembly(input: AssemblyInput, manifest: AssetManifest): AssemblySpec {
  const profile = CATEGORY_PROFILES[input.category];
  const template = FRAME_TEMPLATES[profile.template];
  const index = manifestIndex(manifest);
  const p = input.parts;
  const warnings: string[] = [];

  for (const slot of Object.keys(p) as BikeSlot[]) {
    if (!PROTOTYPE_SLOTS.includes(slot)) warnings.push(`slot ${slot}: not covered by the P0 prototype (no geometry, shown as data-only)`);
  }

  // Frame — must match the category's template (categories do not share one bicycle).
  const frame = resolveAssetPart("frame", p.frame, index, "frame");
  if (frame.node.status === "ok") {
    const entry = index.get(`${(p.frame!.visual as { key: string }).key}@${(p.frame!.visual as { version: number }).version}`)!;
    if (entry.template !== template.id || !entry.categories.includes(input.category)) {
      frame.node.status = "invalid_binding";
      frame.node.representation = "none";
      frame.node.source = null;
      frame.node.warnings.push(`frame: ${entry.key} is a ${entry.template} frame for ${entry.categories.join("/")}; this bike is ${profile.label} (${template.id})`);
    } else {
      const missingAnchors = template.requiredAnchors.filter((a) => !frame.anchors[a]);
      if (missingAnchors.length) {
        frame.node.status = "invalid_binding";
        frame.node.warnings.push(`frame: missing required ${template.id} anchors: ${missingAnchors.join(", ")}`);
      }
    }
  }

  const fork = resolveAssetPart("fork", p.fork, index, "fork");
  attach(fork, frame, "head_lower", "crown_race");

  const wheelFront = resolveGenerated("wheel_front", p.wheelset, "wheel", "front");
  const wheelRear = resolveGenerated("wheel_rear", p.wheelset, "wheel", "rear");
  attach(wheelFront, fork, "front_axle", "hub_axle");
  attach(wheelRear, frame, "rear_axle", "hub_axle");

  const tireFront = resolveGenerated("tire_front", p.front_tire, "tire", "front");
  const tireRear = resolveGenerated("tire_rear", p.rear_tire, "tire", "rear");
  attach(tireFront, wheelFront, "bead", "bead");
  attach(tireRear, wheelRear, "bead", "bead");

  const all = [frame, fork, wheelFront, wheelRear, tireFront, tireRear];

  // Interface checks that the renderer reports (the compatibility engine decides).
  const frameBsd = frame.node.status === "ok" ? index.get(`${(p.frame!.visual as { key: string }).key}@${(p.frame!.visual as { version: number }).version}`)?.measured.wheel_bsd_mm : undefined;
  for (const w of [wheelFront, wheelRear]) {
    if (w.node.status === "ok" && frameBsd && w.gen && w.gen.params.bsd_mm !== frameBsd) w.node.warnings.push(`wheel_size: ${w.gen.params.bsd_mm} mm BSD on a frame designed for ${frameBsd} mm`);
  }

  // Ground solve: rotate the frame about Z so both tires (or rims) touch y = 0.
  const contact = (tire: Resolved, wheel: Resolved) => (tire.node.status === "ok" ? tire.outerRadiusM : wheel.node.status === "ok" ? wheel.outerRadiusM : undefined);
  const Rr = contact(tireRear, wheelRear);
  const Rf = contact(tireFront, wheelFront);
  let pitch: number | null = null;
  let frameWorld: Pose | null = null;
  if (frame.node.status === "ok") {
    const rearAxle = frame.anchors.rear_axle.pose.t;
    const frontAxle = fork.node.status === "ok" && fork.node.local ? transformPoint(fork.node.local, fork.anchors.front_axle.pose.t) : null;
    if (Rr !== undefined && Rf !== undefined && frontAxle) {
      const dx = frontAxle[0] - rearAxle[0];
      const dy = frontAxle[1] - rearAxle[1];
      const L = Math.hypot(dx, dy);
      pitch = Math.asin((Rf - Rr) / L) - Math.atan2(dy, dx);
    } else {
      pitch = 0;
      warnings.push("ground solve incomplete: front or rear contact unknown — frame shown level");
    }
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch);
    const r: Pose["r"] = [q.x, q.y, q.z, q.w];
    const rotatedRear = transformPoint({ t: [0, 0, 0], r }, rearAxle);
    const rearRadius = Rr ?? (frameBsd ? frameBsd / 2000 : 0.311);
    frameWorld = { t: [0, rearRadius - rotatedRear[1], 0], r };
  }

  // World poses (parents first: array order already respects the attachment tree).
  const byId = new Map(all.map((x) => [x.node.id, x]));
  for (const x of all) {
    const n = x.node;
    if (n.status !== "ok") continue;
    if (n.id === "frame") {
      n.local = frameWorld ?? { ...IDENTITY };
      n.world = n.local;
    } else if (n.attach) {
      const parent = byId.get(n.attach.parent)!.node;
      n.world = parent.world && n.local ? multiply(parent.world, n.local) : null;
    }
    if (n.world) for (const [id, a] of Object.entries(x.anchors)) n.anchorsWorld[id] = transformPoint(n.world, a.pose.t);
  }

  // Verify contact after solving (guards the maths).
  for (const [tire, wheel] of [[tireFront, wheelFront], [tireRear, wheelRear]] as const) {
    const w = wheel.node.world;
    const R = tire.node.status === "ok" ? tire.outerRadiusM : wheel.outerRadiusM;
    if (w && R !== undefined && pitch !== null && Math.abs(w.t[1] - R) > TOLERANCE.groundContactM) {
      warnings.push(`${wheel.node.id}: ground contact off by ${((w.t[1] - R) * 1000).toFixed(2)} mm`);
    }
  }

  const derived = {
    pitchDeg: pitch === null ? null : round(THREE.MathUtils.radToDeg(pitch), 0.001),
    bbHeightMm: frameWorld ? round(frameWorld.t[1] * 1000, 0.1) : null,
    wheelbaseMm: wheelFront.node.world && wheelRear.node.world ? round((wheelFront.node.world.t[0] - wheelRear.node.world.t[0]) * 1000, 0.1) : null,
  };

  const nodes = all.map((x) => x.node);
  return {
    spec: ASSEMBLY_SPEC,
    category: input.category,
    template: template.id,
    nodes,
    derived,
    warnings: [...warnings, ...nodes.flatMap((n) => n.warnings)],
    revision: revisionRefs(nodes),
    fingerprint: assemblyFingerprint(nodes),
  };
}

/** What build revisions store per slot to reproduce the exact geometry (spec §7). */
export function revisionRefs(nodes: AssemblyNode[]): AssemblySpec["revision"] {
  const out: AssemblySpec["revision"] = {};
  for (const n of nodes) {
    if (!n.slot || out[n.slot]) continue;
    let ref: RevisionVisualRef;
    if (n.status === "ok" && n.source?.kind === "asset") {
      ref = { representation: n.representation as "exact" | "representative", asset: { key: n.source.key, version: n.source.version, sha256: n.source.sha256 } };
    } else if (n.status === "ok" && n.source?.kind === "generator") {
      ref = { representation: "generated", generator: { id: n.source.generator, version: n.source.version, params: n.source.params, paramsHash: hash64(stableStringify(n.source.params)) } };
    } else {
      ref = { representation: "none", reason: n.status };
    }
    out[n.slot] = ref;
  }
  return out;
}

const q = (v: number[], step: number) => v.map((x) => round(x, step).toFixed(5));

export function assemblyFingerprint(nodes: AssemblyNode[]): string {
  return hash64(
    stableStringify(
      nodes.map((n) => ({
        id: n.id,
        status: n.status,
        source: n.source?.kind === "asset" ? `${n.source.key}@${n.source.version}:${n.source.sha256}` : n.source ? stableStringify(n.source.params) : null,
        t: n.world ? q(n.world.t, 0.0001) : null,
        r: n.world ? q(n.world.r, 0.0001) : null,
      })),
    ),
  );
}

export type { Vec3 };
