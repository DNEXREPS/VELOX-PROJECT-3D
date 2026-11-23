/**
 * Author B — demo 29" hardtail frame (fictional, size L). Written independently of the
 * road frame: different tube layout, materials and geometry; same interface contract.
 */
import * as THREE from "three";
import { exportAsset, iface, tube } from "../authoring-kit.mts";
import type { AssetDeclaration, Vec3 } from "../../../src/lib/assembly/spec.ts";

const G = { stack: 625, reach: 455, ha: 65.5, sa: 76, cs: 435, drop: 60, ht: 110, st: 440 };
const r = (d: number) => (d * Math.PI) / 180;

const P = {
  bb: [0, 0, 0] as Vec3,
  axle: [-Math.sqrt(G.cs ** 2 - G.drop ** 2) / 1000, G.drop / 1000, 0] as Vec3,
  htTop: [G.reach / 1000, G.stack / 1000, 0] as Vec3,
  up: [-Math.cos(r(G.ha)), Math.sin(r(G.ha)), 0] as Vec3,
  seatUp: [-Math.cos(r(G.sa)), Math.sin(r(G.sa)), 0] as Vec3,
};
const htBottom: Vec3 = [P.htTop[0] - P.up[0] * G.ht / 1000, P.htTop[1] - P.up[1] * G.ht / 1000, 0];
const stTop: Vec3 = [P.seatUp[0] * G.st / 1000, P.seatUp[1] * G.st / 1000, 0];

const frame = new THREE.Group();
const paint = new THREE.MeshStandardMaterial({ name: "MAT__paint_primary", color: "#5d6a3a", roughness: 0.5, metalness: 0.3 });
const parts: [string, THREE.BufferGeometry][] = [
  ["ht_top_tube", tube([stTop[0] + 0.02, stTop[1] - 0.06, 0], [P.htTop[0] - 0.01, P.htTop[1] - 0.03, 0], 0.02, 0.022)],
  ["ht_down_tube", tube(P.bb, [htBottom[0], htBottom[1] + 0.02, 0], 0.03, 0.026)],
  ["ht_seat_tube", tube(P.bb, stTop, 0.017, 0.017)],
  ["ht_head_tube", tube(htBottom, P.htTop, 0.027, 0.024)],
  ["ht_bb", new THREE.CylinderGeometry(0.025, 0.025, 0.073, 20).rotateX(Math.PI / 2)],
  ["ht_cs_l", tube([0, 0, -0.04], [P.axle[0], P.axle[1], -0.074], 0.013, 0.009)],
  ["ht_cs_r", tube([0, 0, 0.04], [P.axle[0], P.axle[1], 0.074], 0.013, 0.009)],
  ["ht_ss_l", tube([stTop[0] - 0.005, stTop[1] - 0.1, -0.012], [P.axle[0], P.axle[1], -0.074], 0.01, 0.008)],
  ["ht_ss_r", tube([stTop[0] - 0.005, stTop[1] - 0.1, 0.012], [P.axle[0], P.axle[1], 0.074], 0.01, 0.008)],
];
for (const [name, g] of parts) {
  const m = new THREE.Mesh(g, paint);
  m.name = name;
  frame.add(m);
}

const decl: AssetDeclaration = {
  spec: "velox-assembly/1",
  key: "frame-hardtail-demo",
  version: 1,
  kind: "frame",
  label: 'VELOX Demo 29" hardtail frame (L)',
  representation: "representative",
  categories: ["mtb_hardtail"],
  template: "hardtail",
  units: "m",
  anchors: {
    bb: iface(frame, "ANC__", "bb", "spindle", P.bb, [0, 0, 1], { standard: "bsa_73" }),
    rear_axle: iface(frame, "ANC__", "rear_axle", "axle", P.axle, [0, 0, 1], { standard: "12x148_boost" }),
    head_upper: iface(frame, "ANC__", "head_upper", "tube", P.htTop, P.up, { standard: "zs44_ec49", slide: { min: 0, max: 0.03 } }),
    head_lower: iface(frame, "ANC__", "head_lower", "tube", htBottom, [-P.up[0], -P.up[1], 0], { standard: "zs44_ec49" }),
    seat_tube: iface(frame, "ANC__", "seat_tube", "tube", stTop, P.seatUp, { standard: "31.6", slide: { min: -0.26, max: -0.1 } }),
    rd_hanger: iface(frame, "ANC__", "rd_hanger", "face", [P.axle[0], P.axle[1] - 0.025, 0.077], [0, 0, 1], { standard: "udh" }),
    rear_brake: iface(frame, "ANC__", "rear_brake", "face", [P.axle[0] + 0.05, P.axle[1] + 0.03, -0.07], [0, 0, -1], { standard: "post_mount_180" }),
  },
  mounts: {},
  measured: { stack_mm: G.stack, reach_mm: G.reach, head_angle_deg: G.ha, seat_angle_deg: G.sa, chainstay_mm: G.cs, bb_drop_mm: G.drop, wheel_bsd_mm: 622, head_tube_mm: G.ht },
  materials: { MAT__paint_primary: "paint_primary" },
  license: { id: "LicenseRef-VELOX-demo", attribution: "VELOX demo asset (fictional frame)" },
  author: "VELOX P0 author B",
  source: "scripts/assets/authors/frame-hardtail-demo.mts",
  demo: true,
};
await exportAsset(frame, decl);
