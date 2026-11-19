/**
 * resolveAssembly(): configuration → AssemblySpec. Pure and deterministic.
 *
 * Inputs: the components (installed or pending), their visual bindings and recorded
 * dimensions, plus the asset manifest (declarations only — no GLB parsing). The output
 * is the single description consumed by the 3D renderer, the 2D projection, the
 * measurements panel, the tests and build revisions.
 *
 * P1 scope: frame, fork, wheelset, tires, stem, handlebar, seatpost, crankset, cassette,
 * chain, front/rear rotor. Other installed slots are listed in `notModelled`.
 * The compatibility engine stays the authority: mismatches here are warnings only.
 */
import * as THREE from "three";
import type { BikeSlot } from "@/lib/domain/slots";
import { CATEGORY_PROFILES, FRAME_TEMPLATES, ISO_BSD_MM, TOLERANCE } from "./conventions";
import { GENERATORS, GENERATOR_VERSIONS, chainParams, sprocketRadius, type GeneratorResolution } from "./generators";
import { hash64, round, stableStringify } from "./fingerprint";
import { attachPose, IDENTITY, multiply, transformPoint } from "./math";
import {
  ASSEMBLY_SPEC,
  type AnchorDecl,
  type AssemblyInput,
  type AssemblyNode,
  type AssemblySpec,
  type AssetManifest,
  type GeneratorId,
  type ManifestEntry,
  type MountDecl,
  type NodeStatus,
  type PartInput,
  type Pose,
  type RevisionVisualRef,
} from "./spec";

/** Slots with geometry in this engine version. */
export const MODELLED_SLOTS: BikeSlot[] = ["frame", "fork", "wheelset", "front_tire", "rear_tire", "stem", "handlebar", "seatpost", "crankset", "cassette", "chain", "front_rotor", "rear_rotor"];
/** @deprecated P0 name */
export const PROTOTYPE_SLOTS = MODELLED_SLOTS;

/** Display placements used until fit data exists (P3). Listed as assumptions on the nodes. */
export const DISPLAY_FIT = { stemAboveHeadTubeM: 0.01, seatpostInsertionM: 0.12 } as const;

interface Built {
  node: AssemblyNode;
  anchors: Record<string, AnchorDecl>;
  mounts: Record<string, MountDecl>;
  outerRadiusM?: number;
  gen?: GeneratorResolution;
  entry?: ManifestEntry;
  /** false when an authored asset only represents the shape class (not recorded geometry). */
  recordedGeometry?: boolean;
  /** No part recorded for this slot: kept internally for dependencies, omitted from the output. */
  absent?: boolean;
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

function empty(id: string, slot: BikeSlot, part: PartInput | undefined, status: NodeStatus, extra: Partial<AssemblyNode> = {}): Built {
  return { node: emptyNode(id, slot, part?.name ?? "Not recorded", status, extra), anchors: {}, mounts: {}, absent: !part };
}

function resolveAsset(id: string, slot: BikeSlot, part: PartInput | undefined, index: Map<string, ManifestEntry>, kind: ManifestEntry["kind"]): Built {
  if (!part || !part.visual) return empty(id, slot, part, "no_visual");
  if (part.visual.kind !== "asset") return empty(id, slot, part, "invalid_binding", { warnings: [`${id}: a generator binding is not valid for ${kind}`] });
  const entry = index.get(`${part.visual.key}@${part.visual.version}`);
  if (!entry || entry.kind !== kind) return empty(id, slot, part, "invalid_binding", { warnings: [`${id}: asset ${part.visual.key}@${part.visual.version} is not an approved ${kind} asset`] });
  return {
    node: emptyNode(id, slot, part.name, "ok", { representation: entry.representation, source: { kind: "asset", key: entry.key, version: entry.version, sha256: entry.sha256, file: entry.file } }),
    anchors: entry.anchors,
    mounts: entry.mounts,
    entry,
    recordedGeometry: part.visual.matchesRecordedGeometry === true,
  };
}

function resolveGen(id: string, slot: BikeSlot, part: PartInput | undefined, generator: GeneratorId, position?: "front" | "rear", extraDims: Record<string, unknown> = {}): Built {
  if (!part || !part.visual) return empty(id, slot, part, "no_visual");
  if (part.visual.kind !== "generator" || part.visual.generator !== generator) return empty(id, slot, part, "invalid_binding", { warnings: [`${id}: expected the ${generator} generator`] });
  const def = GENERATORS[generator];
  const dims = { ...part.dims, ...extraDims };
  const gen = def.resolve(dims, { position, variant: part.visual.variant });
  if (!gen.ok) return empty(id, slot, part, "missing_dimensions", { missing: gen.missing });
  return {
    node: emptyNode(id, slot, part.name, "ok", {
      representation: "generated",
      source: { kind: "generator", generator, version: GENERATOR_VERSIONS[generator], variant: part.visual.variant, params: gen.params, assumptions: gen.assumptions },
    }),
    anchors: gen.anchors,
    mounts: gen.mounts,
    outerRadiusM: gen.outerRadiusM,
    gen,
  };
}

function attach(child: Built, host: Built, anchorId: string, mountId: string, slide = 0, angle = 0): void {
  if (child.node.status !== "ok") return;
  const anchor = host.anchors[anchorId];
  const mount = child.mounts[mountId];
  if (host.node.status !== "ok" || !anchor) {
    child.node.status = "host_unavailable";
    child.node.warnings.push(host.node.status === "ok" ? `${child.node.id}: ${host.node.id} has no ${anchorId} mount` : `${child.node.id}: mounts on ${host.node.id}, which has no geometry`);
    return;
  }
  if (!mount) {
    child.node.status = "invalid_binding";
    child.node.warnings.push(`${child.node.id}: missing mount ${mountId}`);
    return;
  }
  if (anchor.type !== mount.type) child.node.warnings.push(`${child.node.id}: interface type ${mount.type} does not match ${anchorId} (${anchor.type})`);
  if (anchor.standard && mount.standard && anchor.standard !== mount.standard) child.node.warnings.push(`interface_mismatch:${anchorId}: part ${mount.standard} ≠ host ${anchor.standard}`);
  if (anchor.slide && (slide < anchor.slide.min - 1e-9 || slide > anchor.slide.max + 1e-9)) child.node.warnings.push(`${child.node.id}: slide ${slide} outside ${anchor.slide.min}…${anchor.slide.max} at ${anchorId}`);
  child.node.attach = { parent: host.node.id, anchor: anchorId, mount: mountId, slide, angle };
  child.node.local = attachPose(anchor.pose, mount.pose, slide, angle);
}

function setWorld(b: Built, parent: Built | null) {
  const n = b.node;
  if (n.status !== "ok" || !n.local) return;
  n.world = parent ? (parent.node.world ? multiply(parent.node.world, n.local) : null) : n.local;
  if (n.world) for (const [id, a] of Object.entries(b.anchors)) n.anchorsWorld[id] = transformPoint(n.world, a.pose.t);
}

/** Rotation about the anchor's +Z that makes the part's own "up" match world up (level). */
function levelRoll(parentWorld: Pose, anchor: Pose, mount: Pose): number {
  const aW = multiply(parentWorld, anchor);
  const q = new THREE.Quaternion(...aW.r);
  const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const target = new THREE.Vector3(0, 1, 0).sub(Z.clone().multiplyScalar(Z.y));
  if (target.lengthSq() < 1e-10) return 0;
  const t = target.normalize().applyQuaternion(q.clone().invert());
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...mount.r).invert());
  return Math.atan2(t.y, t.x) - Math.atan2(u.y, u.x);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function resolveAssembly(input: AssemblyInput, manifest: AssetManifest): AssemblySpec {
  const profile = CATEGORY_PROFILES[input.category];
  const template = FRAME_TEMPLATES[profile.template];
  const index = manifestIndex(manifest);
  const p = input.parts;
  const warnings: string[] = [];
  const notModelled = (Object.keys(p) as BikeSlot[]).filter((s) => !MODELLED_SLOTS.includes(s)).sort();

  // ---- Frame (template + category must match) -------------------------------------
  const frame = resolveAsset("frame", "frame", p.frame, index, "frame");
  if (frame.node.status === "ok" && frame.entry) {
    if (frame.entry.template !== template.id || !frame.entry.categories.includes(input.category)) {
      frame.node.status = "invalid_binding";
      frame.node.representation = "none";
      frame.node.source = null;
      frame.node.warnings.push(`frame: ${frame.entry.key} is a ${frame.entry.template} frame for ${frame.entry.categories.join("/")}; this bike is ${profile.label} (${template.id})`);
    } else {
      const missingAnchors = template.requiredAnchors.filter((a) => !frame.anchors[a]);
      if (missingAnchors.length) {
        frame.node.status = "invalid_binding";
        frame.node.warnings.push(`frame: missing required ${template.id} anchors: ${missingAnchors.join(", ")}`);
      }
    }
  }

  // ---- Rolling chassis ------------------------------------------------------------
  const fork = resolveAsset("fork", "fork", p.fork, index, "fork");
  attach(fork, frame, "head_lower", "crown_race");
  const ws = p.wheelset;
  const wheelDims = ws ? { bsd_mm: bsdFromDims(ws.dims) ?? undefined } : {};
  const wheelFront = resolveGen("wheel_front", "wheelset", ws, "wheel", "front", wheelDims);
  const wheelRear = resolveGen("wheel_rear", "wheelset", ws, "wheel", "rear", wheelDims);
  attach(wheelFront, fork, "front_axle", "hub_axle");
  attach(wheelRear, frame, "rear_axle", "hub_axle");
  const tireDims = (t: PartInput | undefined) => (t ? { bsd_mm: bsdFromDims(t.dims) ?? undefined, width_mm: t.dims.width_mm ?? t.dims.tire_width_mm } : {});
  const tireFront = resolveGen("tire_front", "front_tire", p.front_tire, "tire", "front", tireDims(p.front_tire));
  const tireRear = resolveGen("tire_rear", "rear_tire", p.rear_tire, "tire", "rear", tireDims(p.rear_tire));
  attach(tireFront, wheelFront, "bead", "bead");
  attach(tireRear, wheelRear, "bead", "bead");

  const frameBsd = frame.node.status === "ok" ? frame.entry?.measured.wheel_bsd_mm : undefined;
  for (const w of [wheelFront, wheelRear]) {
    if (w.node.status === "ok" && frameBsd && w.gen && w.gen.params.bsd_mm !== frameBsd) w.node.warnings.push(`wheel_size: ${w.gen.params.bsd_mm} mm BSD on a frame designed for ${frameBsd} mm`);
  }

  // ---- Ground solve ---------------------------------------------------------------
  const contact = (tire: Built, wheel: Built) => (tire.node.status === "ok" ? tire.outerRadiusM : wheel.node.status === "ok" ? wheel.outerRadiusM : undefined);
  const Rr = contact(tireRear, wheelRear);
  const Rf = contact(tireFront, wheelFront);
  let pitch: number | null = null;
  if (frame.node.status === "ok") {
    const rearAxle = frame.anchors.rear_axle.pose.t;
    const frontAxle = fork.node.status === "ok" && fork.node.local ? transformPoint(fork.node.local, fork.anchors.front_axle.pose.t) : null;
    if (Rr !== undefined && Rf !== undefined && frontAxle) {
      const dx = frontAxle[0] - rearAxle[0];
      const dy = frontAxle[1] - rearAxle[1];
      pitch = Math.asin((Rf - Rr) / Math.hypot(dx, dy)) - Math.atan2(dy, dx);
    } else {
      pitch = 0;
      warnings.push("ground solve incomplete: front or rear contact unknown — frame shown level");
    }
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch);
    const r: Pose["r"] = [q.x, q.y, q.z, q.w];
    const rotatedRear = transformPoint({ t: [0, 0, 0], r }, rearAxle);
    const rearRadius = Rr ?? (frameBsd ? frameBsd / 2000 : 0.311);
    frame.node.local = { t: [0, rearRadius - rotatedRear[1], 0], r };
  }
  setWorld(frame, null);
  for (const [b, parent] of [[fork, frame], [wheelFront, fork], [wheelRear, frame], [tireFront, wheelFront], [tireRear, wheelRear]] as const) setWorld(b, parent);

  for (const [tire, wheel] of [[tireFront, wheelFront], [tireRear, wheelRear]] as const) {
    const w = wheel.node.world;
    const R = tire.node.status === "ok" ? tire.outerRadiusM : wheel.outerRadiusM;
    if (w && R !== undefined && Math.abs(w.t[1] - R) > TOLERANCE.groundContactM) warnings.push(`${wheel.node.id}: ground contact off by ${((w.t[1] - R) * 1000).toFixed(2)} mm`);
  }

  // ---- Cockpit & seat -------------------------------------------------------------
  const stem = resolveGen("stem", "stem", p.stem, "stem");
  if (stem.node.status === "ok" && frame.node.status === "ok") {
    const range = frame.anchors.head_upper?.slide ?? { min: 0, max: 0 };
    attach(stem, frame, "head_upper", "steerer_clamp", clamp(DISPLAY_FIT.stemAboveHeadTubeM, range.min, range.max));
    (stem.node.source as { assumptions: string[] }).assumptions.push(`Headset cover and spacer stack not recorded — stem placed ${DISPLAY_FIT.stemAboveHeadTubeM * 1000} mm above the head tube (display)`);
  } else attach(stem, frame, "head_upper", "steerer_clamp");
  setWorld(stem, frame);

  const bar = resolveGen("handlebar", "handlebar", p.handlebar, "handlebar");
  if (bar.node.status === "ok" && stem.node.status === "ok" && stem.node.world && bar.mounts.clamp && stem.anchors.bar_clamp) {
    attach(bar, stem, "bar_clamp", "clamp", 0, levelRoll(stem.node.world, stem.anchors.bar_clamp.pose, bar.mounts.clamp.pose));
    (bar.node.source as { assumptions: string[] }).assumptions.push("Bar roll not recorded — shown level");
  } else attach(bar, stem, "bar_clamp", "clamp");
  setWorld(bar, stem);

  const post = resolveGen("seatpost", "seatpost", p.seatpost, "seatpost");
  if (post.node.status === "ok" && frame.node.status === "ok") {
    const range = frame.anchors.seat_tube?.slide ?? { min: -1, max: 0 };
    const length = (post.gen!.params.length_mm as number) / 1000;
    const slide = clamp(-Math.min(DISPLAY_FIT.seatpostInsertionM, length - 0.05), range.min, range.max);
    attach(post, frame, "seat_tube", "insertion", slide);
    (post.node.source as { assumptions: string[] }).assumptions.push(`Saddle height not recorded — post shown with ${Math.round(-slide * 1000)} mm insertion (display)`);
  } else attach(post, frame, "seat_tube", "insertion");
  setWorld(post, frame);

  // ---- Drivetrain & brakes ---------------------------------------------------------
  const crank = resolveGen("crankset", "crankset", p.crankset, "crankset");
  attach(crank, frame, "bb", "spindle");
  setWorld(crank, frame);
  const cassette = resolveGen("cassette", "cassette", p.cassette, "cassette");
  attach(cassette, wheelRear, "freehub", "freehub");
  setWorld(cassette, wheelRear);
  const rotorFront = resolveGen("rotor_front", "front_rotor", p.front_rotor, "rotor");
  attach(rotorFront, wheelFront, "rotor", "hub");
  setWorld(rotorFront, wheelFront);
  const rotorRear = resolveGen("rotor_rear", "rear_rotor", p.rear_rotor, "rotor");
  attach(rotorRear, wheelRear, "rotor", "hub");
  setWorld(rotorRear, wheelRear);

  const chain = resolveGen("chain", "chain", p.chain, "chain");
  if (chain.node.status === "ok") {
    const ring = crank.node.anchorsWorld.ring_big;
    const cog = cassette.node.anchorsWorld.cog_smallest;
    if (crank.node.status !== "ok" || cassette.node.status !== "ok" || !ring || !cog) {
      chain.node.status = "host_unavailable";
      chain.node.warnings.push("chain: needs a crankset and a cassette with geometry");
    } else {
      const rings = crank.gen!.params.chainrings as number[];
      const cogs = cassette.gen!.params.cogs as number[];
      const params = {
        ...chainParams({
          ring_x: ring[0] * 1000, ring_y: ring[1] * 1000, ring_z: ring[2] * 1000, ring_r: sprocketRadius(rings[0]) * 1000,
          cog_x: cog[0] * 1000, cog_y: cog[1] * 1000, cog_z: cog[2] * 1000, cog_r: sprocketRadius(cogs[cogs.length - 1]) * 1000,
        }),
        speeds: chain.gen!.params.speeds as number,
      };
      (chain.node.source as { params: Record<string, number> }).params = params;
      chain.node.attach = null;
      chain.node.local = { ...IDENTITY };
      chain.node.world = { ...IDENTITY };
    }
  }

  const all = [frame, fork, wheelFront, wheelRear, tireFront, tireRear, stem, bar, post, crank, cassette, chain, rotorFront, rotorRear];
  const nodes = all.filter((b) => !b.absent).map((b) => b.node);

  // ---- Measurements (with honest quality) ----------------------------------------
  const bb = frame.node.world?.t ?? null;
  const notes = { chassis: [] as string[], cockpit: [] as string[], seat: [] as string[] };
  if (frame.node.status === "ok" && !frame.recordedGeometry) notes.chassis.push("Frame geometry from a representative model — this frame's geometry chart is not recorded");
  if (fork.node.status === "ok" && !fork.recordedGeometry) notes.chassis.push("Fork geometry from a representative model");
  for (const t of [tireFront, tireRear]) {
    if (t.node.status === "ok" && t.gen?.assumptions.some((a) => a.startsWith("Outer diameter not recorded"))) {
      notes.chassis.push("Tire height modelled from width (outer diameter not recorded)");
      break;
    }
  }
  for (const t of [tireFront, tireRear]) if (t.node.status !== "ok") notes.chassis.push(`${t.node.id}: no tire geometry — rim radius used for ground contact`);
  if (stem.node.status === "ok") notes.cockpit.push("Headset/spacer stack not recorded", `Stem clamp stack modelled (${stem.gen!.params.stack_mm} mm)`);
  if (post.node.status === "ok") notes.seat.push("Saddle height not recorded (fit data)", ...post.gen!.assumptions.filter((a) => a.startsWith("Setback")));
  const uniq = (xs: string[]) => [...new Set(xs)];
  const q = (value: unknown, n: string[]) => ({ quality: value === null ? ("unavailable" as const) : n.length ? ("estimate" as const) : ("recorded" as const), notes: value === null ? [] : uniq(n) });

  const rel = (v: [number, number, number] | undefined | null) => (v && bb ? { x: round((v[0] - bb[0]) * 1000, 0.1), y: round((v[1] - bb[1]) * 1000, 0.1) } : null);
  const derived = {
    pitchDeg: pitch === null ? null : round(THREE.MathUtils.radToDeg(pitch), 0.001),
    bbHeightMm: bb ? round(bb[1] * 1000, 0.1) : null,
    wheelbaseMm: wheelFront.node.world && wheelRear.node.world ? round((wheelFront.node.world.t[0] - wheelRear.node.world.t[0]) * 1000, 0.1) : null,
    barClampMm: bar.node.status === "ok" ? rel(bar.node.world?.t) : stem.node.status === "ok" ? rel(stem.node.anchorsWorld.bar_clamp) : null,
    saddleClampMm: post.node.status === "ok" ? rel(post.node.anchorsWorld.saddle_clamp) : null,
    lowestPedalMm: bb && crank.node.status === "ok" ? round(bb[1] * 1000 - (crank.gen!.params.crank_length_mm as number), 0.1) : null,
  };
  const derivedQuality = {
    pitchDeg: q(derived.pitchDeg, notes.chassis),
    bbHeightMm: q(derived.bbHeightMm, notes.chassis),
    wheelbaseMm: q(derived.wheelbaseMm, notes.chassis),
    barClampMm: q(derived.barClampMm, [...notes.chassis, ...notes.cockpit]),
    saddleClampMm: q(derived.saddleClampMm, [...notes.chassis, ...notes.seat]),
    lowestPedalMm: q(derived.lowestPedalMm, notes.chassis),
  };

  return {
    spec: ASSEMBLY_SPEC,
    category: input.category,
    template: template.id,
    nodes,
    derived,
    derivedQuality,
    notModelled,
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
      ref = { representation: "generated", generator: { id: n.source.generator, version: n.source.version, variant: n.source.variant, params: n.source.params, paramsHash: hash64(stableStringify(n.source.params)) } };
    } else {
      ref = { representation: "none", reason: n.status };
    }
    out[n.slot] = ref;
  }
  return out;
}

const qz = (v: number[], step: number) => v.map((x) => round(x, step).toFixed(5));

export function assemblyFingerprint(nodes: AssemblyNode[]): string {
  return hash64(
    stableStringify(
      nodes.map((n) => ({
        id: n.id,
        status: n.status,
        source: n.source?.kind === "asset" ? `${n.source.key}@${n.source.version}:${n.source.sha256}` : n.source ? stableStringify({ v: n.source.variant, p: n.source.params }) : null,
        t: n.world ? qz(n.world.t, 0.0001) : null,
        r: n.world ? qz(n.world.r, 0.0001) : null,
      })),
    ),
  );
}
