/**
 * VELOX assembly specification — `velox-assembly/1`.
 *
 * Shared contract between authored assets, parametric generators, the pure resolver,
 * the 3D renderer, the 2D fallback and build revisions. Framework-free.
 * Normative documentation: docs/3d-engine/specification.md.
 */
import type { BikeSlot } from "@/lib/domain/slots";

export const ASSEMBLY_SPEC = "velox-assembly/1" as const;

/** Metres. Right-handed: +X forward, +Y up, +Z drive side (rider's right). */
export type Vec3 = [number, number, number];
/** Unit quaternion in glTF order [x, y, z, w]. */
export type Quat = [number, number, number, number];
/** A rigid frame: translation then rotation, both relative to the parent. */
export interface Pose {
  t: Vec3;
  r: Quat;
}

/**
 * How a slot is represented in 3D. Visual accuracy is reported separately from data
 * accuracy (verification_status of the catalog record).
 *  - exact:          authored model of this exact product, with a documented right to use it
 *  - representative: authored model of the product family / shape class
 *  - generated:      built by a VELOX generator from this product's recorded dimensions
 *  - none:           no geometry; the UI states it explicitly
 */
export const REPRESENTATIONS = ["exact", "representative", "generated", "none"] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

/** Interface (mounting) types. Each defines what the local +Z axis means — see conventions.ts. */
export const INTERFACE_TYPES = ["axle", "spindle", "tube", "clamp", "face", "bead", "spline", "thread"] as const;
export type InterfaceType = (typeof INTERFACE_TYPES)[number];

/** Architectural targets. Maps to bicycles.category (mountain → mtb_hardtail; folding is a new enum value in P3). */
export const CATEGORY_TARGETS = ["road", "gravel", "mtb_hardtail", "folding"] as const;
export type CategoryTarget = (typeof CATEGORY_TARGETS)[number];

export const FRAME_TEMPLATES = ["diamond", "hardtail", "folding"] as const;
export type FrameTemplateId = (typeof FRAME_TEMPLATES)[number];

export const ASSET_KINDS = [
  "frame", "fork", "stem", "handlebar", "handlepost", "seatpost", "saddle", "crankset", "cassette",
  "rear_derailleur", "front_derailleur", "brake_caliper", "shifter", "pedal",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const MATERIAL_ROLES = ["paint_primary", "paint_secondary", "metal", "rubber", "carbon", "decal", "plastic"] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

/** Where a part can be attached (on the host). */
export interface AnchorDecl {
  /** glTF node name: ANC__<id> (see NODE_NAME in conventions.ts) */
  node: string;
  type: InterfaceType;
  /** Pose relative to the asset root. */
  pose: Pose;
  /** Interface standard, e.g. "12x142" axle, "tapered_1.125_1.5" head tube, "31.8" clamp. */
  standard?: string;
  /** Allowed travel along +Z in metres (seatpost insertion, spacer stack). */
  slide?: { min: number; max: number };
  /** Rigid body the anchor belongs to (reserved for suspension: "main", "rear_triangle", "lowers"). */
  body?: string;
}

/** How this part attaches to its host. */
export interface MountDecl {
  /** glTF node name: MNT__<id> */
  node: string;
  type: InterfaceType;
  pose: Pose;
  standard?: string;
}

/**
 * Reserved for suspension and folding mechanisms (not implemented in P0/P1): a joint
 * connects two rigid bodies of the SAME asset; `state` names the input that drives it
 * (e.g. "sag_mm", "fold_deg"). The resolver will solve joints before attaching children,
 * so adding suspension does not change the attachment model.
 */
export interface JointDecl {
  node: string;
  kind: "revolute" | "prismatic";
  parentBody: string;
  childBody: string;
  pose: Pose;
  range: [number, number];
  state: string;
}

export interface LicenseInfo {
  /** SPDX id or a contract reference, e.g. "CC0-1.0", "CC-BY-4.0", "LicenseRef-VELOX-generated". */
  id: string;
  attribution?: string;
  url?: string;
}

/** Declaration embedded in the asset (glTF root extras.velox) and copied into the manifest. */
export interface AssetDeclaration {
  spec: typeof ASSEMBLY_SPEC;
  key: string;
  version: number;
  kind: AssetKind;
  label: string;
  /** Authored assets are never "generated"; "none" is not an asset. */
  representation: "exact" | "representative";
  categories: CategoryTarget[];
  /** Frames only. */
  template?: FrameTemplateId;
  units: "m";
  anchors: Record<string, AnchorDecl>;
  mounts: Record<string, MountDecl>;
  joints?: Record<string, JointDecl>;
  /** Measured dimensions of the geometry (mm / degrees), checked by the pipeline. */
  measured: Record<string, number>;
  materials: Record<string, MaterialRole>;
  license: LicenseInfo;
  author: string;
  source: string;
  /** True for fictional demo assets (labelled in the UI like demo catalog data). */
  demo: boolean;
  /** Source textures (PNG next to the file); the pipeline emits KTX2 + a fallback per entry. */
  textures?: { role: MaterialRole; source: string }[];
}

export interface TextureEntry {
  role: MaterialRole;
  /** Preferred GPU-compressed texture. */
  ktx2: { file: string; sha256: string; bytes: number };
  /** Used when KTX2 decoding is unavailable (no WebAssembly). */
  fallback: { file: string; sha256: string; bytes: number; mime: "image/png" | "image/webp" };
}

/** Manifest entry produced by the asset pipeline (versioned, immutable per key@version). */
export interface ManifestEntry extends Omit<AssetDeclaration, "textures"> {
  file: string;
  sha256: string;
  bytes: number;
  triangles: number;
  /** Fingerprint of the decoded geometry (quantised positions), for decoder cross-checks. */
  geometryFingerprint: string;
  compression: "meshopt" | "none";
  textures: TextureEntry[];
  pipeline: string;
}

export interface AssetManifest {
  spec: typeof ASSEMBLY_SPEC;
  manifestVersion: number;
  generatedAt: string;
  assets: ManifestEntry[];
}

/* ------------------------------------------------------------------------------------ */
/* Resolver input / output                                                              */
/* ------------------------------------------------------------------------------------ */

export type GeneratorId = "wheel" | "tire";

export type VisualBinding =
  | { kind: "asset"; key: string; version: number }
  | { kind: "generator"; generator: GeneratorId; version: number };

/** One installed (or pending) component, as the resolver sees it. */
export interface PartInput {
  slot: BikeSlot;
  componentId?: string | null;
  name: string;
  /** null = this component has no 3D representation. */
  visual: VisualBinding | null;
  /** Recorded catalog dimensions; null/undefined = unknown. NEVER filled with guesses. */
  dims: Record<string, number | string | null | undefined>;
}

export interface FitInput {
  /** Spacer stack under the stem (mm). Optional, private by default (P3: bicycle_fit). */
  spacerStackMm?: number;
  /** Saddle height BB → saddle top along the seat tube (mm). */
  saddleHeightMm?: number;
}

export interface AssemblyInput {
  category: CategoryTarget;
  parts: Partial<Record<BikeSlot, PartInput>>;
  fit?: FitInput;
}

export type NodeStatus =
  /** Geometry resolved and attached. */
  | "ok"
  /** The component has no 3D binding (representation none). */
  | "no_visual"
  /** Required dimensions are missing — needs verification; nothing is guessed. */
  | "missing_dimensions"
  /** The part it attaches to is unavailable. */
  | "host_unavailable"
  /** The binding points at an asset that does not exist / does not fit this frame template. */
  | "invalid_binding"
  /** Slot not covered by the P0 prototype. */
  | "not_in_prototype";

export type VisualSourceRef =
  | { kind: "asset"; key: string; version: number; sha256: string; file: string }
  | { kind: "generator"; generator: GeneratorId; version: number; params: Record<string, number>; assumptions: string[] };

export interface AssemblyNode {
  /** Stable id used by the renderer to reconcile (e.g. "frame", "wheel_front", "tire_rear"). */
  id: string;
  slot: BikeSlot | null;
  label: string;
  representation: Representation;
  status: NodeStatus;
  source: VisualSourceRef | null;
  /** Parent node id and the anchor/mount used. */
  attach: { parent: string; anchor: string; mount: string; slide: number; angle: number } | null;
  /** Local pose relative to the parent node (root: relative to the world). */
  local: Pose | null;
  /** World pose of the node root. */
  world: Pose | null;
  /** World positions of this node's anchors (diagnostics, 2D projection). */
  anchorsWorld: Record<string, Vec3>;
  missing: string[];
  warnings: string[];
}

/** What a build revision stores per slot to reproduce the geometry exactly (P3 migration). */
export type RevisionVisualRef =
  | { representation: "exact" | "representative"; asset: { key: string; version: number; sha256: string } }
  | { representation: "generated"; generator: { id: GeneratorId; version: number; params: Record<string, number>; paramsHash: string } }
  | { representation: "none"; reason: NodeStatus };

export interface AssemblySpec {
  spec: typeof ASSEMBLY_SPEC;
  category: CategoryTarget;
  template: FrameTemplateId;
  nodes: AssemblyNode[];
  derived: {
    /** Frame rotation about +Z needed for both tires to touch the ground (degrees, + = nose up). */
    pitchDeg: number | null;
    bbHeightMm: number | null;
    wheelbaseMm: number | null;
  };
  warnings: string[];
  /** Per-slot references for build revisions. */
  revision: Partial<Record<BikeSlot, RevisionVisualRef>>;
  /** Stable hash of every node's source and world pose (0.1 mm / 0.01° resolution). */
  fingerprint: string;
}
