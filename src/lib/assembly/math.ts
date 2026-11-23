/** Pose maths for the assembly (three.js math classes; no rendering, runs in Node). */
import * as THREE from "three";
import type { Pose, Quat, Vec3 } from "./spec";
import { INTERFACE_AXIS, TOLERANCE } from "./conventions";
import type { InterfaceType } from "./spec";

export const IDENTITY: Pose = { t: [0, 0, 0], r: [0, 0, 0, 1] };

export function poseToMatrix(p: Pose): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...p.t), new THREE.Quaternion(...p.r), new THREE.Vector3(1, 1, 1));
}

export function matrixToPose(m: THREE.Matrix4): Pose {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(t, q, s);
  return { t: [t.x, t.y, t.z], r: [q.x, q.y, q.z, q.w] };
}

export function multiply(a: Pose, b: Pose): Pose {
  return matrixToPose(poseToMatrix(a).multiply(poseToMatrix(b)));
}

export function invert(p: Pose): Pose {
  return matrixToPose(poseToMatrix(p).invert());
}

export function transformPoint(p: Pose, v: Vec3): Vec3 {
  const out = new THREE.Vector3(...v).applyMatrix4(poseToMatrix(p));
  return [out.x, out.y, out.z];
}

/** Local +Z axis of a pose, in its parent's space. */
export function zAxis(p: Pose): Vec3 {
  const v = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...p.r));
  return [v.x, v.y, v.z];
}

/**
 * Build an interface frame from its +Z axis and an "up" hint (+Y = hint made orthogonal
 * to +Z). Used by authoring tools and generators so every anchor follows the same rule.
 */
export function frameFromAxis(origin: Vec3, z: Vec3, upHint: Vec3 = [0, 1, 0]): Pose {
  const Z = new THREE.Vector3(...z).normalize();
  let Y = new THREE.Vector3(...upHint).sub(Z.clone().multiplyScalar(new THREE.Vector3(...upHint).dot(Z)));
  if (Y.lengthSq() < 1e-10) Y = new THREE.Vector3(1, 0, 0).sub(Z.clone().multiplyScalar(Z.x));
  Y.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return { t: origin, r: [q.x, q.y, q.z, q.w] };
}

/**
 * Interface frame following the convention: +Z = the interface axis (per type), +Y =
 * world-forward made orthogonal to +Z for tubes (their axis is near vertical, so "up"
 * is unstable), world-up made orthogonal to +Z for every other type.
 */
export function interfaceFrame(type: InterfaceType, origin: Vec3, z: Vec3): Pose {
  return frameFromAxis(origin, z, type === "tube" ? [1, 0, 0] : [0, 1, 0]);
}

/**
 * Attachment: part.local = anchor · T(0,0,slide) · Rz(angle) · mount⁻¹
 * (anchor in the host's space, mount in the part's space).
 */
export function attachPose(anchor: Pose, mount: Pose, slide = 0, angleRad = 0): Pose {
  const m = poseToMatrix(anchor)
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, slide))
    .multiply(new THREE.Matrix4().makeRotationZ(angleRad))
    .multiply(poseToMatrix(mount).invert());
  return matrixToPose(m);
}

export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const va = new THREE.Vector3(...a).normalize();
  const vb = new THREE.Vector3(...b).normalize();
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(va.dot(vb), -1, 1)));
}

/** Angle between two orientations (deg). */
export function rotationDeltaDeg(a: Quat, b: Quat): number {
  return THREE.MathUtils.radToDeg(new THREE.Quaternion(...a).angleTo(new THREE.Quaternion(...b)));
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Validate an interface frame against the convention for its type. Returns problems (empty = valid). */
export function checkInterfacePose(name: string, type: InterfaceType, pose: Pose, side: "drive" | "non_drive" = "drive"): string[] {
  const issues: string[] = [];
  const len = Math.hypot(...pose.r);
  if (Math.abs(len - 1) > TOLERANCE.unitQuat) issues.push(`${name}: rotation is not a unit quaternion (|q| = ${len.toFixed(6)})`);
  if (pose.t.some((n) => !Number.isFinite(n)) || pose.r.some((n) => !Number.isFinite(n))) issues.push(`${name}: non-finite pose`);
  const z = zAxis(pose);
  const rule = INTERFACE_AXIS[type].zMustBe;
  if (rule === "lateral") {
    const expected: Vec3 = type === "thread" && side === "non_drive" ? [0, 0, -1] : [0, 0, 1];
    const a = angleBetweenDeg(z, expected);
    if (a > TOLERANCE.axisAngleDeg) issues.push(`${name}: ${type} +Z must point ${expected[2] > 0 ? "to the drive side" : "outward (non-drive)"} (off by ${a.toFixed(2)}°)`);
  } else if (rule === "in_bike_plane") {
    const out = THREE.MathUtils.radToDeg(Math.asin(Math.min(1, Math.abs(z[2]))));
    if (out > TOLERANCE.axisAngleDeg) issues.push(`${name}: ${type} +Z must lie in the bike's centre plane (off by ${out.toFixed(2)}°)`);
  }
  return issues;
}
