/**
 * Asset contract validation (velox-assembly/1). Pure: used by the asset pipeline and the
 * unit tests. Input is the declaration plus what was measured from the actual file.
 */
import * as THREE from "three";
import { FRAME_TEMPLATES, KIND_REQUIREMENTS, NODE_NAME, TOLERANCE } from "./conventions";
import { checkInterfacePose, distance, rotationDeltaDeg, zAxis } from "./math";
import { ASSEMBLY_SPEC, ASSET_KINDS, CATEGORY_TARGETS, MATERIAL_ROLES, type AssetDeclaration, type Pose, type Vec3 } from "./spec";

/** Triangle budgets (LOD0) per kind — docs/3d-engine/specification.md §9. */
export const TRIANGLE_BUDGET: Partial<Record<AssetDeclaration["kind"], number>> = {
  frame: 40_000,
  fork: 10_000,
  stem: 3_000,
  handlebar: 8_000,
  handlepost: 8_000,
  seatpost: 3_000,
  saddle: 6_000,
  crankset: 10_000,
  cassette: 10_000,
  rear_derailleur: 8_000,
  front_derailleur: 4_000,
  brake_caliper: 4_000,
  shifter: 6_000,
  pedal: 3_000,
};

export interface MeasuredFile {
  /** Every node name in the file. */
  nodeNames: string[];
  /** Nodes with a mesh. */
  meshNodeNames: string[];
  /** Mesh nodes with more than one primitive (not allowed: breaks per-node fingerprints). */
  multiPrimitiveNodes: string[];
  materialNames: string[];
  /** Pose of each node relative to the asset root. */
  nodePoses: Record<string, Pose>;
  triangles: number;
  /** Every string found in names, extras and asset metadata (privacy scan). */
  strings: string[];
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SECRET = /eyJ[A-Za-z0-9_-]{8,}\.|sb_(secret|publishable)_|token=|apikey=/i;
const LOCAL_PATH = /(?:\/home\/|\/Users\/|[A-Z]:\\\\Users\\\\)/;
/** Asset references use `key@version` (e.g. "frame-road-demo@1.carbon.png") — not e-mail addresses. */
const ASSET_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*@\d+(?:\.[a-z0-9_-]+)*$/;

export function validateAsset(decl: AssetDeclaration, file: MeasuredFile): string[] {
  const issues: string[] = [];
  const req = (cond: unknown, msg: string) => {
    if (!cond) issues.push(msg);
  };

  // Declaration shape
  req(decl.spec === ASSEMBLY_SPEC, `spec must be ${ASSEMBLY_SPEC}`);
  req(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(decl.key) && decl.key.length <= 64, "key must be a lowercase slug (≤ 64)");
  req(Number.isInteger(decl.version) && decl.version >= 1, "version must be a positive integer");
  req((ASSET_KINDS as readonly string[]).includes(decl.kind), `unknown kind ${decl.kind}`);
  req(decl.representation === "exact" || decl.representation === "representative", "authored assets are exact or representative");
  req(decl.units === "m", "units must be metres");
  req(decl.categories.length > 0 && decl.categories.every((c) => (CATEGORY_TARGETS as readonly string[]).includes(c)), "categories must be known targets");
  req(decl.license?.id && decl.license.id.length > 0, "license.id is required");
  req(decl.author && decl.source, "author and source are required");
  if (decl.representation === "exact") req(decl.license.id !== "LicenseRef-VELOX-generated" && !decl.demo, "exact representation requires a real product model with documented rights (not demo / generated)");
  for (const role of Object.values(decl.materials)) req((MATERIAL_ROLES as readonly string[]).includes(role), `unknown material role ${role}`);

  // Naming
  for (const n of [...file.nodeNames, ...file.materialNames]) {
    if (NODE_NAME.reserved.test(n)) issues.push(`name "${n}" contains reserved characters (. : / [ ] whitespace)`);
  }
  for (const n of file.nodeNames) {
    if (/^(ANC|MNT|JNT)__/.test(n) && !NODE_NAME.anchor.test(n.replace(/^(MNT|JNT)__/, "ANC__"))) issues.push(`node "${n}" does not follow the ANC__/MNT__/JNT__ id pattern`);
  }
  for (const n of file.multiPrimitiveNodes) issues.push(`mesh node "${n}" has more than one primitive`);

  // Kind / template requirements
  const kindReq = KIND_REQUIREMENTS[decl.kind];
  const anchorsRequired = [...(kindReq?.anchors ?? []), ...(decl.kind === "frame" && decl.template ? FRAME_TEMPLATES[decl.template].requiredAnchors : [])];
  for (const a of anchorsRequired) req(decl.anchors[a], `missing required anchor ${a}`);
  for (const m of kindReq?.mounts ?? []) req(decl.mounts[m], `missing required mount ${m}`);
  for (const k of kindReq?.measured ?? []) req(typeof decl.measured[k] === "number", `missing measured.${k}`);
  if (decl.kind === "frame") {
    req(decl.template, "frames must declare a template");
    if (decl.template) req(decl.categories.every((c) => FRAME_TEMPLATES[decl.template!].categories.includes(c)), `categories not supported by template ${decl.template}`);
  }

  // Interfaces: node present, empty, pose equals declaration, axis rule
  const interfaces = [
    ...Object.entries(decl.anchors).map(([id, a]) => ({ id, prefix: "ANC__", ...a })),
    ...Object.entries(decl.mounts).map(([id, m]) => ({ id, prefix: "MNT__", ...m })),
  ];
  for (const i of interfaces) {
    const expected = `${i.prefix}${i.id}`;
    if (i.node !== expected) issues.push(`${i.id}: node must be named ${expected}`);
    const actual = file.nodePoses[i.node];
    if (!actual) {
      issues.push(`${i.node}: node not found in file`);
      continue;
    }
    if (file.meshNodeNames.includes(i.node)) issues.push(`${i.node}: interface nodes must be empty (no mesh)`);
    const dp = distance(actual.t, i.pose.t);
    if (dp > TOLERANCE.declaredPositionM) issues.push(`${i.node}: position differs from declaration by ${(dp * 1000).toFixed(3)} mm`);
    const da = rotationDeltaDeg(actual.r, i.pose.r);
    if (da > TOLERANCE.declaredAngleDeg) issues.push(`${i.node}: orientation differs from declaration by ${da.toFixed(3)}°`);
    const side = i.id.endsWith("_l") ? "non_drive" : "drive";
    issues.push(...checkInterfacePose(i.node, i.type, actual, side));
    const slide = (i as { slide?: { min: number; max: number } }).slide;
    if (slide) req(slide.min <= slide.max, `${i.node}: slide.min > slide.max`);
  }

  // Declared measurements vs geometry derived from the interface poses
  issues.push(...checkMeasured(decl));

  // Budget
  const budget = TRIANGLE_BUDGET[decl.kind];
  if (budget) req(file.triangles <= budget, `triangles ${file.triangles} exceed the ${decl.kind} budget ${budget}`);

  // Privacy: public assets must not carry personal data, secrets or local paths
  for (const s of file.strings) {
    if (s === decl.license.url || ASSET_REF.test(s)) continue;
    if (EMAIL.test(s) || UUID.test(s) || SECRET.test(s) || LOCAL_PATH.test(s)) issues.push(`privacy: "${s.slice(0, 60)}" looks like personal data, an id, a secret or a local path`);
  }
  return issues;
}

const deg = (r: number) => THREE.MathUtils.radToDeg(r);

/** Recompute geometry-chart values from the interface poses and compare (±2 mm, ±0.1°). */
export function checkMeasured(decl: AssetDeclaration): string[] {
  const issues: string[] = [];
  const m = decl.measured;
  const near = (label: string, declared: number | undefined, actual: number, tol: number) => {
    if (declared === undefined) return;
    if (Math.abs(declared - actual) > tol) issues.push(`measured.${label} = ${declared} but geometry gives ${actual.toFixed(2)}`);
  };
  if (decl.kind === "frame") {
    const a = decl.anchors;
    if (a.head_upper) {
      near("stack_mm", m.stack_mm, a.head_upper.pose.t[1] * 1000, TOLERANCE.measuredAuthoredMm);
      near("reach_mm", m.reach_mm, a.head_upper.pose.t[0] * 1000, TOLERANCE.measuredAuthoredMm);
      const z: Vec3 = zAxis(a.head_upper.pose);
      near("head_angle_deg", m.head_angle_deg, deg(Math.atan2(z[1], -z[0])), 0.1);
    }
    if (a.seat_tube) {
      const z = zAxis(a.seat_tube.pose);
      near("seat_angle_deg", m.seat_angle_deg, deg(Math.atan2(z[1], -z[0])), 0.1);
    }
    if (a.rear_axle) {
      const [x, y] = a.rear_axle.pose.t;
      near("chainstay_mm", m.chainstay_mm, Math.hypot(x, y) * 1000, TOLERANCE.measuredAuthoredMm);
      near("bb_drop_mm", m.bb_drop_mm, y * 1000, TOLERANCE.measuredAuthoredMm);
    }
  }
  if (decl.kind === "fork" && decl.mounts.crown_race && decl.anchors.front_axle) {
    const crown = decl.mounts.crown_race.pose.t;
    const axle = decl.anchors.front_axle.pose.t;
    near("axle_to_crown_mm", m.axle_to_crown_mm, (crown[1] - axle[1]) * 1000, TOLERANCE.measuredAuthoredMm);
    near("offset_mm", m.offset_mm, (axle[0] - crown[0]) * 1000, TOLERANCE.measuredAuthoredMm);
  }
  return issues;
}
