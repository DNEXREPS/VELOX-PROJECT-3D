/**
 * Author A — demo road frame (fictional, size M). Geometry from its own chart; knows
 * nothing about forks or wheels, only the velox-assembly/1 interfaces.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { encodePng, exportAsset, iface, tube } from "../authoring-kit.mts";
import type { AnchorDecl, AssetDeclaration, Vec3 } from "../../../src/lib/assembly/spec.ts";

const chart = { stack: 560, reach: 385, headAngle: 72.5, seatAngle: 73.5, chainstay: 410, bbDrop: 70, headTube: 150, seatTube: 520 };
const mm = (v: number) => v / 1000;
const rad = THREE.MathUtils.degToRad;

const bb: Vec3 = [0, 0, 0];
const rearAxle: Vec3 = [-Math.sqrt(chart.chainstay ** 2 - chart.bbDrop ** 2) / 1000, mm(chart.bbDrop), 0];
const steerUp: Vec3 = [-Math.cos(rad(chart.headAngle)), Math.sin(rad(chart.headAngle)), 0];
const headTop: Vec3 = [mm(chart.reach), mm(chart.stack), 0];
const headBottom: Vec3 = [headTop[0] - steerUp[0] * mm(chart.headTube), headTop[1] - steerUp[1] * mm(chart.headTube), 0];
const seatUp: Vec3 = [-Math.cos(rad(chart.seatAngle)), Math.sin(rad(chart.seatAngle)), 0];
const seatTop: Vec3 = [seatUp[0] * mm(chart.seatTube), seatUp[1] * mm(chart.seatTube), 0];

const root = new THREE.Group();
const carbon = new THREE.MeshStandardMaterial({ name: "MAT__carbon", color: "#22252b", roughness: 0.45, metalness: 0.1 });
const mesh = (name: string, g: THREE.BufferGeometry) => {
  const m = new THREE.Mesh(g, carbon);
  m.name = name;
  root.add(m);
};
mesh("tube_top", tube(seatTop, headTop, 0.016));
mesh("tube_down", tube(bb, headBottom, 0.024, 0.02));
mesh("tube_seat", tube(bb, seatTop, 0.017));
mesh("tube_head", tube(headBottom, headTop, 0.022, 0.019));
mesh("bb_shell", new THREE.CylinderGeometry(0.023, 0.023, 0.086, 20).rotateX(Math.PI / 2));
const stays: THREE.BufferGeometry[] = [];
for (const z of [-0.064, 0.064]) {
  stays.push(tube([0, 0, z * 0.55], [rearAxle[0], rearAxle[1], z], 0.012, 0.008));
  stays.push(tube([seatTop[0] - 0.01, seatTop[1] - 0.03, z * 0.2], [rearAxle[0], rearAxle[1], z], 0.009, 0.007));
}
mesh("stays", mergeGeometries(stays)!);

const anchors: Record<string, AnchorDecl> = {
  bb: iface(root, "ANC__", "bb", "spindle", bb, [0, 0, 1], { standard: "bsa_68" }),
  rear_axle: iface(root, "ANC__", "rear_axle", "axle", rearAxle, [0, 0, 1], { standard: "12x142" }),
  head_upper: iface(root, "ANC__", "head_upper", "tube", headTop, steerUp, { standard: "tapered_1.125_1.5", slide: { min: 0, max: 0.04 } }),
  head_lower: iface(root, "ANC__", "head_lower", "tube", headBottom, [-steerUp[0], -steerUp[1], 0], { standard: "tapered_1.125_1.5" }),
  seat_tube: iface(root, "ANC__", "seat_tube", "tube", seatTop, seatUp, { standard: "27.2", slide: { min: -0.3, max: -0.08 } }),
  rd_hanger: iface(root, "ANC__", "rd_hanger", "face", [rearAxle[0], rearAxle[1] - 0.025, 0.07], [0, 0, 1]),
  rear_brake: iface(root, "ANC__", "rear_brake", "face", [rearAxle[0] + 0.07, rearAxle[1] - 0.012, -0.06], [0, 1, 0], { standard: "flat_mount_140" }),
  // Braze-on face behind the seat tube; normal points backward, perpendicular to the tube.
  fd_mount: iface(root, "ANC__", "fd_mount", "face", [seatUp[0] * 0.17 - 0.018, seatUp[1] * 0.17, 0], [-Math.sin(rad(chart.seatAngle)), -Math.cos(rad(chart.seatAngle)), 0], { standard: "braze_on" }),
};

// Procedural carbon weave texture (project-authored, so the KTX2 path is exercised).
const size = 128;
const px = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const cell = ((x >> 3) + (y >> 3)) & 1;
    const v = 30 + (cell ? ((x & 7) * 6) : ((y & 7) * 6));
    px.set([v, v + 2, v + 6, 255], (y * size + x) * 4);
  }

const decl: AssetDeclaration = {
  spec: "velox-assembly/1",
  key: "frame-road-demo",
  version: 1,
  kind: "frame",
  label: "VELOX Demo road frame (M)",
  representation: "representative",
  categories: ["road"],
  template: "diamond",
  units: "m",
  anchors,
  mounts: {},
  measured: {
    stack_mm: chart.stack, reach_mm: chart.reach, head_angle_deg: chart.headAngle, seat_angle_deg: chart.seatAngle,
    chainstay_mm: chart.chainstay, bb_drop_mm: chart.bbDrop, wheel_bsd_mm: 622, head_tube_mm: chart.headTube,
  },
  materials: { MAT__carbon: "carbon" },
  license: { id: "LicenseRef-VELOX-demo", attribution: "VELOX demo asset (fictional frame)" },
  author: "VELOX P0 author A",
  source: "scripts/assets/authors/frame-road-demo.mts",
  demo: true,
  textures: [{ role: "carbon", source: "frame-road-demo@1.carbon.png" }],
};
await exportAsset(root, decl, { role: "carbon", data: encodePng(size, size, px) });
