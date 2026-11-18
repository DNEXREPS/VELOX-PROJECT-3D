/**
 * Generates public/models/velox-placeholder-road.glb
 *
 *   npm run model:generate  (scripts/generate-placeholder-model.mts)
 *
 * A PROCEDURAL PLACEHOLDER road bicycle built from primitives. It exists so the
 * full GLB pipeline (loading, mesh→slot mapping, selection, highlighting,
 * parametric preview) is exercised without depending on unavailable external
 * assets. It is labelled as a placeholder in the GLB extras and in the UI.
 *
 * Coordinate system: metres, X = forward, Y = up, Z = lateral (drive side +Z).
 * Every mesh name is referenced explicitly by src/features/studio/models/registry.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// --- Node polyfill: GLTFExporter (binary) reads Blobs through FileReader. ---------
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onload: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onload?.();
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString("base64")}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

// --- Materials -----------------------------------------------------------------------
const mat = {
  paint: new THREE.MeshStandardMaterial({ name: "Paint", color: "#2b3038", metalness: 0.35, roughness: 0.42 }),
  carbon: new THREE.MeshStandardMaterial({ name: "CarbonMatte", color: "#1b1c1f", metalness: 0.1, roughness: 0.62 }),
  alloy: new THREE.MeshStandardMaterial({ name: "AlloySatin", color: "#a3a8ae", metalness: 0.85, roughness: 0.32 }),
  darkAlloy: new THREE.MeshStandardMaterial({ name: "AlloyDark", color: "#3b3f45", metalness: 0.75, roughness: 0.4 }),
  rubber: new THREE.MeshStandardMaterial({ name: "Rubber", color: "#141414", metalness: 0, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ name: "Rim", color: "#18191b", metalness: 0.45, roughness: 0.48 }),
  saddle: new THREE.MeshStandardMaterial({ name: "SaddleCover", color: "#161618", metalness: 0, roughness: 0.75 }),
  chain: new THREE.MeshStandardMaterial({ name: "ChainSteel", color: "#70757b", metalness: 0.9, roughness: 0.3 }),
  tape: new THREE.MeshStandardMaterial({ name: "BarTape", color: "#202124", metalness: 0, roughness: 0.85 }),
};

const root = new THREE.Group();
root.name = "VeloxPlaceholderRoadBike";
root.userData = {
  velox: {
    placeholder: true,
    generator: "scripts/generate-placeholder-model.ts",
    version: 1,
    notice: "Procedural placeholder geometry — not a representation of a real bicycle model.",
    baseTireWidthMm: 28,
  },
};

function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = root) {
  // No textures are used: drop UVs to keep the asset small.
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** Cylinder geometry spanning a → b (baked into the geometry). */
function tubeGeo(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2 = r1, segments = 20) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, segments, 1, false);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  geo.applyQuaternion(q);
  geo.translate(a.x, a.y, a.z);
  return geo;
}

function discGeo(center: THREE.Vector3, radius: number, thickness: number, segments = 48) {
  const geo = new THREE.CylinderGeometry(radius, radius, thickness, segments);
  geo.rotateX(Math.PI / 2);
  geo.translate(center.x, center.y, center.z);
  return geo;
}

function boxGeo(center: THREE.Vector3, sx: number, sy: number, sz: number, rotZ = 0) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  if (rotZ) geo.rotateZ(rotZ);
  geo.translate(center.x, center.y, center.z);
  return geo;
}

// --- Key geometry points ---------------------------------------------------------------
const WHEEL_R = 0.311; // ISO 622 bead seat radius
const rearAxle = v(-0.405, 0.34);
const frontAxle = v(0.585, 0.34);
const bb = v(0, 0.27);
const seatCluster = v(-0.153, 0.788);
const headTop = v(0.4, 0.84);
const headBottom = v(0.44, 0.69);

// --- Frame -------------------------------------------------------------------------------
add("Frame_TopTube", tubeGeo(seatCluster.clone().add(v(0.01, -0.02)), headTop.clone().add(v(0, -0.025)), 0.017, 0.016), mat.paint);
add("Frame_DownTube", tubeGeo(bb, headBottom.clone().add(v(0, 0.02)), 0.024, 0.021), mat.paint);
add("Frame_SeatTube", tubeGeo(bb, seatCluster, 0.018, 0.016), mat.paint);
add("Frame_HeadTube", tubeGeo(headBottom, headTop, 0.022, 0.019), mat.paint);
add("Frame_BBShell", discGeo(bb, 0.022, 0.085, 24), mat.paint);
for (const [side, z] of [["L", -0.062], ["R", 0.062]] as const) {
  add(`Frame_ChainStay_${side}`, tubeGeo(bb.clone().add(v(0, 0, z * 0.6)), rearAxle.clone().add(v(0, 0, z)), 0.012, 0.008), mat.paint);
  add(`Frame_SeatStay_${side}`, tubeGeo(seatCluster.clone().add(v(-0.01, -0.03, z * 0.25)), rearAxle.clone().add(v(0.008, 0.01, z)), 0.009, 0.007), mat.paint);
}

// --- Fork --------------------------------------------------------------------------------
add("Fork_Crown", boxGeo(headBottom.clone().add(v(0.006, -0.02)), 0.05, 0.035, 0.12, -0.3), mat.paint);
for (const [side, z] of [["L", -0.05], ["R", 0.05]] as const) {
  add(`Fork_Blade_${side}`, tubeGeo(headBottom.clone().add(v(0.01, -0.035, z * 0.9)), frontAxle.clone().add(v(0, 0, z)), 0.015, 0.008), mat.paint);
}

// --- Headset / cockpit -------------------------------------------------------------------
add("Headset_Top", discGeo(headTop.clone().add(v(-0.002, 0.008)), 0.024, 0.016, 24).rotateZ(0), mat.darkAlloy);
add("Headset_Bottom", discGeo(headBottom.clone().add(v(0.002, -0.004)), 0.025, 0.012, 24), mat.darkAlloy);
const stemBase = headTop.clone().add(v(-0.006, 0.035));
const barCenter = v(0.505, 0.885);
add("Stem_Body", tubeGeo(stemBase, barCenter.clone().add(v(-0.015, 0)), 0.017, 0.015), mat.carbon);
add("Stem_Clamp", discGeo(stemBase, 0.02, 0.045, 24).rotateX(0), mat.carbon);
add("Stem_Faceplate", boxGeo(barCenter.clone().add(v(0.006, 0)), 0.02, 0.042, 0.06), mat.carbon);

const half = 0.21;
const barPath: THREE.Vector3[] = [];
for (const sign of [-1, 1]) {
  const pts = [
    v(0.53, 0.755, sign * half),
    v(0.6, 0.762, sign * half),
    v(0.632, 0.815, sign * half),
    v(0.606, 0.868, sign * half),
    v(0.565, 0.888, sign * (half - 0.005)),
    v(0.52, 0.887, sign * (half - 0.04)),
  ];
  if (sign === -1) barPath.push(...pts, v(barCenter.x, barCenter.y, -0.08), v(barCenter.x, barCenter.y, 0));
  else barPath.push(v(barCenter.x, barCenter.y, 0.08), ...pts.reverse());
}
add("Handlebar", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPath, false, "centripetal"), 110, 0.0125, 10, false), mat.carbon);

for (const [side, z] of [["L", -half], ["R", half]] as const) {
  const hood = boxGeo(v(0.585, 0.902, z), 0.07, 0.035, 0.03, -0.25);
  const lever = tubeGeo(v(0.61, 0.89, z), v(0.645, 0.79, z), 0.006, 0.004, 10);
  add(`Shifter_${side}`, mergeGeometries([hood, lever])!, mat.darkAlloy);
}

// --- Seatpost / saddle -------------------------------------------------------------------
const postTop = v(-0.205, 0.955);
add("Seatpost", tubeGeo(seatCluster.clone().add(v(0.012, -0.04)), postTop, 0.0136), mat.carbon);
const saddleShape = new THREE.Shape();
saddleShape.moveTo(0.075, 0);
saddleShape.bezierCurveTo(0.075, 0.018, 0.02, 0.02, -0.04, 0.03);
saddleShape.bezierCurveTo(-0.12, 0.07, -0.19, 0.075, -0.2, 0.05);
saddleShape.bezierCurveTo(-0.205, 0.02, -0.205, -0.02, -0.2, -0.05);
saddleShape.bezierCurveTo(-0.19, -0.075, -0.12, -0.07, -0.04, -0.03);
saddleShape.bezierCurveTo(0.02, -0.02, 0.075, -0.018, 0.075, 0);
const saddleGeo = new THREE.ExtrudeGeometry(saddleShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
saddleGeo.rotateX(-Math.PI / 2);
saddleGeo.translate(postTop.x + 0.065, postTop.y + 0.012, 0);
add("Saddle", saddleGeo, mat.saddle);

// --- Wheels --------------------------------------------------------------------------------
function wheel(prefix: "Front" | "Rear", axle: THREE.Vector3) {
  const rim = new THREE.TorusGeometry(WHEEL_R - 0.013, 0.014, 8, 72);
  rim.scale(1, 1, 0.62);
  rim.translate(axle.x, axle.y, axle.z);
  add(`Wheel_${prefix}_Rim`, rim, mat.rim);

  // Tire: base width 28 mm (tube radius 14 mm). Scaled on Z for parametric width previews.
  const tire = new THREE.TorusGeometry(WHEEL_R + 0.014, 0.014, 10, 80);
  const tireMesh = add(`Tire_${prefix}`, tire, mat.rubber);
  tireMesh.position.copy(axle);

  add(`Wheel_${prefix}_Hub`, tubeGeo(axle.clone().add(v(0, 0, -0.05)), axle.clone().add(v(0, 0, 0.05)), 0.018, 0.018, 24), mat.alloy);

  const spokes: THREE.BufferGeometry[] = [];
  const count = 24;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const side = i % 2 === 0 ? 1 : -1;
    const hub = axle.clone().add(v(Math.cos(a + side * 0.12) * 0.024, Math.sin(a + side * 0.12) * 0.024, side * 0.032));
    const rimPt = axle.clone().add(v(Math.cos(a) * (WHEEL_R - 0.025), Math.sin(a) * (WHEEL_R - 0.025), 0));
    spokes.push(tubeGeo(hub, rimPt, 0.0011, 0.0011, 5));
  }
  add(`Wheel_${prefix}_Spokes`, mergeGeometries(spokes)!, mat.alloy);
}
wheel("Front", frontAxle);
wheel("Rear", rearAxle);

// --- Brakes (flat-mount disc) -----------------------------------------------------------------
add("Rotor_Front", discGeo(frontAxle.clone().add(v(0, 0, -0.052)), 0.08, 0.0018, 48), mat.alloy);
add("Rotor_Rear", discGeo(rearAxle.clone().add(v(0, 0, -0.06)), 0.08, 0.0018, 48), mat.alloy);
add("Brake_Front_Caliper", boxGeo(frontAxle.clone().add(v(-0.045, 0.06, -0.06)), 0.055, 0.032, 0.026, -1.1), mat.darkAlloy);
add("Brake_Rear_Caliper", boxGeo(rearAxle.clone().add(v(0.06, 0.035, -0.07)), 0.055, 0.03, 0.026, 0.25), mat.darkAlloy);

// --- Drivetrain --------------------------------------------------------------------------------
const DRIVE_Z = 0.072;
add("Crankset_Chainrings", mergeGeometries([
  discGeo(bb.clone().add(v(0, 0, DRIVE_Z)), 0.104, 0.003, 64),
  discGeo(bb.clone().add(v(0, 0, DRIVE_Z - 0.006)), 0.071, 0.003, 64),
  discGeo(bb.clone().add(v(0, 0, DRIVE_Z + 0.004)), 0.04, 0.008, 5),
])!, mat.darkAlloy);
const crankAngle = -1.2;
const crankEnd = (dir: number) => bb.clone().add(v(Math.cos(crankAngle + (dir < 0 ? Math.PI : 0)) * 0.1725, Math.sin(crankAngle + (dir < 0 ? Math.PI : 0)) * 0.1725));
add("Crankset_Arms", mergeGeometries([
  tubeGeo(bb.clone().add(v(0, 0, DRIVE_Z + 0.012)), crankEnd(1).add(v(0, 0, DRIVE_Z + 0.016)), 0.011, 0.008, 12),
  tubeGeo(bb.clone().add(v(0, 0, -DRIVE_Z - 0.012)), crankEnd(-1).add(v(0, 0, -DRIVE_Z - 0.016)), 0.011, 0.008, 12),
  tubeGeo(bb.clone().add(v(0, 0, -DRIVE_Z - 0.012)), bb.clone().add(v(0, 0, DRIVE_Z + 0.012)), 0.012, 0.012, 16),
])!, mat.darkAlloy);
add("BottomBracket_Cups", mergeGeometries([
  discGeo(bb.clone().add(v(0, 0, 0.047)), 0.021, 0.01, 24),
  discGeo(bb.clone().add(v(0, 0, -0.047)), 0.021, 0.01, 24),
])!, mat.alloy);
for (const [side, dir] of [["R", 1], ["L", -1]] as const) {
  const end = crankEnd(dir);
  add(`Pedal_${side}`, boxGeo(end.add(v(0, 0, dir * (DRIVE_Z + 0.065))), 0.09, 0.018, 0.07), mat.darkAlloy);
}

const cassetteGeos: THREE.BufferGeometry[] = [];
const cogRadii = [0.064, 0.058, 0.052, 0.047, 0.043, 0.039, 0.035, 0.032, 0.029, 0.026, 0.024, 0.022];
cogRadii.forEach((r, i) => cassetteGeos.push(discGeo(rearAxle.clone().add(v(0, 0, 0.028 + i * 0.0036)), r, 0.0016, 28)));
add("Cassette", mergeGeometries(cassetteGeos)!, mat.alloy);

const rdUpper = rearAxle.clone().add(v(-0.005, -0.075, DRIVE_Z));
const rdLower = rearAxle.clone().add(v(0.03, -0.14, DRIVE_Z));
add("RearDerailleur_Body", mergeGeometries([
  boxGeo(rearAxle.clone().add(v(-0.03, -0.03, DRIVE_Z + 0.012)), 0.03, 0.06, 0.018, 0.4),
  boxGeo(rearAxle.clone().add(v(-0.03, -0.075, DRIVE_Z + 0.016)), 0.05, 0.03, 0.02, -0.3),
])!, mat.darkAlloy);
add("RearDerailleur_Cage", mergeGeometries([
  tubeGeo(rdUpper.clone().add(v(0, 0, 0.008)), rdLower.clone().add(v(0, 0, 0.008)), 0.008, 0.008, 8),
  discGeo(rdUpper, 0.014, 0.006, 20),
  discGeo(rdLower, 0.014, 0.006, 20),
])!, mat.alloy);
add("FrontDerailleur", boxGeo(v(-0.035, 0.405, 0.058), 0.06, 0.03, 0.02, -0.2), mat.darkAlloy);

const chainPts = [
  v(0.0, 0.27 + 0.104), v(-0.2, 0.34 + 0.08), v(-0.405, 0.34 + 0.05), v(-0.452, 0.34),
  rdUpper.clone().add(v(-0.016, 0)), rdLower.clone().add(v(-0.012, -0.012)), rdLower.clone().add(v(0.016, -0.004)),
  v(-0.15, 0.2), v(0.0, 0.27 - 0.104), v(0.085, 0.27 - 0.06), v(0.105, 0.27), v(0.08, 0.27 + 0.07),
].map((p) => p.setZ(DRIVE_Z));
add("Chain", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts, true, "centripetal", 0.4), 160, 0.0035, 5, true), mat.chain);

// --- Accessory: bottle cage on down tube ------------------------------------------------
add("Accessory_BottleCage", mergeGeometries([
  tubeGeo(v(0.11, 0.375, -0.0), v(0.245, 0.48, 0), 0.004, 0.004, 8).translate(0, 0.03, 0.02),
  tubeGeo(v(0.11, 0.375, -0.0), v(0.245, 0.48, 0), 0.004, 0.004, 8).translate(0, 0.03, -0.02),
])!, mat.alloy);

// --- Export ----------------------------------------------------------------------------------
const exporter = new GLTFExporter();
const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
const outDir = join(import.meta.dirname, "..", "public", "models");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "velox-placeholder-road.glb");
writeFileSync(out, Buffer.from(result as ArrayBuffer));
const names: string[] = [];
root.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) names.push(o.name);
});
console.log(`Wrote ${out} — ${names.length} meshes, ${(Buffer.byteLength(Buffer.from(result as ArrayBuffer)) / 1024).toFixed(0)} KB`);
