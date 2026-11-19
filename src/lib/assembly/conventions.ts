/**
 * Conventions of `velox-assembly/1`: interface axis rules, tolerances, frame templates
 * per category, required anchors per asset kind, ISO wheel sizes.
 * Normative text: docs/3d-engine/specification.md §2–§4.
 */
import type { AssetKind, CategoryTarget, FrameTemplateId, InterfaceType } from "./spec";

/** Numeric tolerances used by the pipeline, the resolver and the tests. */
export const TOLERANCE = {
  /** Quaternion must be unit length within this. */
  unitQuat: 1e-4,
  /** Declared anchor pose vs the glTF node transform: position (m) and angle (deg). */
  declaredPositionM: 0.0001,
  declaredAngleDeg: 0.05,
  /** Mount/anchor coincidence after assembly. */
  attachPositionM: 0.0001,
  attachAngleDeg: 0.05,
  /** Interface axis direction rules (deg). */
  axisAngleDeg: 0.5,
  /** Declared `measured` dimensions vs the measured geometry. */
  measuredAuthoredMm: 2,
  measuredGeneratedMm: 0.5,
  /** Both tire contact points within this distance of y = 0 after the ground solve. */
  groundContactM: 0.0005,
} as const;

/**
 * Meaning of the local +Z axis for each interface type (the axis the mating part
 * slides along or rotates about). +Y and +X complete a right-handed frame:
 * +Y = world-forward ⟂ +Z for tubes, world-up ⟂ +Z for all other types (math.interfaceFrame).
 */
export const INTERFACE_AXIS: Record<InterfaceType, { rule: string; zMustBe: "lateral" | "in_bike_plane" | "any" }> = {
  axle: { rule: "+Z along the axle toward the drive side; origin midway between the dropout (or locknut) faces", zMustBe: "lateral" },
  spindle: { rule: "+Z along the BB spindle toward the drive side; origin at the BB shell centre", zMustBe: "lateral" },
  bead: { rule: "+Z along the wheel axle toward the drive side; origin at the hub centre; the bead seat diameter is a parameter", zMustBe: "lateral" },
  spline: { rule: "+Z toward the drive side; origin at the locating shoulder (freehub, rotor interface)", zMustBe: "lateral" },
  tube: { rule: "+Z along the tube axis, pointing in the direction the inserted part is withdrawn (seatpost and stem: up; fork at the lower head-tube face: down); origin at the reference face centre; +Y = world-forward made orthogonal to +Z", zMustBe: "in_bike_plane" },
  clamp: { rule: "+Z along the clamped member: lateral (drive side) for handlebars, forward along the rails for saddles; origin at the clamp centre", zMustBe: "any" },
  face: { rule: "+Z is the mounting-face normal pointing out of the host toward the part; origin at the face reference point (first bolt hole / hanger bolt)", zMustBe: "any" },
  thread: { rule: "+Z along the thread axis pointing outward (away from the bike centre plane): +world Z on the drive side, -world Z on the non-drive side", zMustBe: "lateral" },
};

export interface FrameTemplate {
  id: FrameTemplateId;
  label: string;
  categories: CategoryTarget[];
  requiredAnchors: string[];
  optionalAnchors: string[];
  /** How the steering assembly is built on this template. */
  steering: "fork_stem_bar" | "fork_handlepost";
  /** 2D outline: frame anchor ids joined as polylines (projection). */
  outline2d: string[][];
}

/** Anchor sets differ per template: categories do NOT share one universal bicycle. */
export const FRAME_TEMPLATES: Record<FrameTemplateId, FrameTemplate> = {
  diamond: {
    id: "diamond",
    label: "Diamond frame (road, gravel)",
    categories: ["road", "gravel"],
    requiredAnchors: ["bb", "rear_axle", "head_lower", "head_upper", "seat_tube", "rd_hanger", "rear_brake"],
    optionalAnchors: ["fd_mount", "cage_1", "cage_2"],
    steering: "fork_stem_bar",
    outline2d: [["rear_axle", "bb", "seat_tube", "rear_axle"], ["seat_tube", "head_upper", "head_lower", "bb"]],
  },
  hardtail: {
    id: "hardtail",
    label: "Hardtail MTB (rigid rear, suspension or rigid fork)",
    categories: ["mtb_hardtail"],
    requiredAnchors: ["bb", "rear_axle", "head_lower", "head_upper", "seat_tube", "rd_hanger", "rear_brake"],
    optionalAnchors: ["fd_mount", "cage_1", "dropper_port"],
    steering: "fork_stem_bar",
    outline2d: [["rear_axle", "bb", "seat_tube", "rear_axle"], ["seat_tube", "head_upper", "head_lower", "bb"]],
  },
  folding: {
    id: "folding",
    label: "Folding (hinged main frame, handlepost)",
    categories: ["folding"],
    requiredAnchors: ["bb", "rear_axle", "head_lower", "handlepost", "seat_tube", "rear_brake"],
    optionalAnchors: ["rd_hanger", "fold_hinge"],
    steering: "fork_handlepost",
    outline2d: [["rear_axle", "bb", "seat_tube"], ["seat_tube", "bb", "head_lower", "handlepost"]],
  },
};

export interface CategoryProfile {
  target: CategoryTarget;
  label: string;
  template: FrameTemplateId;
  /** ISO 5775 bead seat diameters (mm) the category is designed around. */
  bsdMm: number[];
  /** bicycles.category value(s) mapping to this target. */
  dbCategories: string[];
}

export const CATEGORY_PROFILES: Record<CategoryTarget, CategoryProfile> = {
  road: { target: "road", label: "Road", template: "diamond", bsdMm: [622], dbCategories: ["road", "cyclocross", "time_trial", "touring"] },
  gravel: { target: "gravel", label: "Gravel", template: "diamond", bsdMm: [622, 584], dbCategories: ["gravel"] },
  mtb_hardtail: { target: "mtb_hardtail", label: "Hardtail MTB", template: "hardtail", bsdMm: [622, 584], dbCategories: ["mountain"] },
  folding: { target: "folding", label: "Folding", template: "folding", bsdMm: [349, 406, 451], dbCategories: ["folding"] },
};

/** ISO 5775 bead seat diameters for common size names (catalog `wheel_size` values). */
export const ISO_BSD_MM: Record<string, number> = {
  "700c": 622, "29": 622, "28": 622,
  "650b": 584, "27.5": 584,
  "26": 559,
  "650c": 571,
  "20_451": 451, "20": 406,
  "16_349": 349, "16": 305,
};

export interface KindRequirements {
  mounts: string[];
  anchors: string[];
  measured: string[];
}

/** Required mounting interfaces and measured dimensions per authored asset kind (P0 subset). */
export const KIND_REQUIREMENTS: Partial<Record<AssetKind, KindRequirements>> = {
  frame: { mounts: [], anchors: [], measured: ["stack_mm", "reach_mm", "head_angle_deg", "seat_angle_deg", "chainstay_mm", "bb_drop_mm", "wheel_bsd_mm"] },
  fork: { mounts: ["crown_race"], anchors: ["steerer", "front_axle"], measured: ["axle_to_crown_mm", "offset_mm"] },
};

/** Generated parts: required catalog dimensions (missing → status "missing_dimensions"). */
export const GENERATOR_REQUIREMENTS = {
  wheel: { required: ["bsd_mm"], optional: ["rim_depth_mm", "rim_width_mm", "spoke_count"] },
  tire: { required: ["width_mm", "bsd_mm"], optional: ["outer_diameter_mm"] },
} as const;

/**
 * Node naming. Separator is a double underscore because three.js GLTFLoader strips
 * `.`, `:`, `/`, `[`, `]` from node names and DCC tools (Blender) append `.001` to
 * duplicates. Ids are lowercase snake_case without double underscores.
 */
export const NODE_NAME = {
  anchor: /^ANC__([a-z0-9]+(?:_[a-z0-9]+)*)$/,
  mount: /^MNT__([a-z0-9]+(?:_[a-z0-9]+)*)$/,
  joint: /^JNT__([a-z0-9]+(?:_[a-z0-9]+)*)$/,
  material: /^MAT__([a-z0-9]+(?:_[a-z0-9]+)*)$/,
  /** Characters rejected anywhere in node, mesh and material names. */
  reserved: /[.:/\[\]\s]/,
} as const;

export const anchorNode = (id: string) => `ANC__${id}`;
export const mountNode = (id: string) => `MNT__${id}`;
