/**
 * Authors C/D/E — three rigid demo forks with different axle-to-crown and offset.
 * Authoring pose (normative for forks): crown race seat at the origin, steering axis
 * along +Y, offset toward +X. Each fork knows nothing about any frame.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { exportAsset, iface, tube } from "../authoring-kit.mts";
import type { AssetDeclaration, CategoryTarget } from "../../../src/lib/assembly/spec.ts";

interface ForkSpec {
  key: string;
  label: string;
  author: string;
  a2c: number;
  offset: number;
  axle: string;
  steerer: string;
  width: number;
  categories: CategoryTarget[];
  color: string;
}

const forks: ForkSpec[] = [
  { key: "fork-road-demo", label: "VELOX Demo road fork (carbon, 370 mm)", author: "VELOX P0 author C", a2c: 370, offset: 45, axle: "12x100", steerer: "tapered_1.125_1.5", width: 0.1, categories: ["road"], color: "#20232a" },
  { key: "fork-gravel-demo", label: "VELOX Demo gravel fork (carbon, 395 mm)", author: "VELOX P0 author D", a2c: 395, offset: 50, axle: "12x100", steerer: "tapered_1.125_1.5", width: 0.11, categories: ["gravel", "road"], color: "#3a3f47" },
  // P1: representative model built to the RECORDED geometry of demo catalog fork
  // "demo-carbon-disc-fork" (axle-to-crown 370 mm, offset 47 mm, 12x100, tapered).
  { key: "fork-demo-carbon-disc", label: "VELOX Demo carbon disc fork (370 mm, 47 mm offset)", author: "VELOX P1 author F", a2c: 370, offset: 47, axle: "12x100", steerer: "tapered_1.125_1.5", width: 0.1, categories: ["road"], color: "#1f2228" },
  // P1 MTB demo: representative model built to the RECORDED geometry of demo catalog fork
  // "demo-rigid-mtb-fork-480" (axle-to-crown 480 mm, offset 51 mm, 15x110 Boost, ZS44/EC49).
  { key: "fork-demo-mtb-480", label: 'VELOX Demo 29" rigid MTB fork (480 mm, 51 mm offset)', author: "VELOX P1 author G", a2c: 480, offset: 51, axle: "15x110_boost", steerer: "zs44_ec49", width: 0.13, categories: ["mtb_hardtail"], color: "#5a3d2b" },
  { key: "fork-mtb-rigid-demo", label: 'VELOX Demo 29" rigid MTB fork (470 mm)', author: "VELOX P0 author E", a2c: 470, offset: 44, axle: "15x110_boost", steerer: "zs44_ec49", width: 0.13, categories: ["mtb_hardtail"], color: "#4d4f52" },
];

for (const f of forks) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ name: "MAT__paint_secondary", color: f.color, roughness: 0.5, metalness: 0.2 });
  const axle = [f.offset / 1000, -f.a2c / 1000, 0] as [number, number, number];
  const half = f.width / 2;
  const blades = mergeGeometries([
    tube([0.004, -0.03, -half * 0.8], [axle[0], axle[1], -half], 0.016, 0.009),
    tube([0.004, -0.03, half * 0.8], [axle[0], axle[1], half], 0.016, 0.009),
  ])!;
  const crown = new THREE.BoxGeometry(0.05, 0.035, f.width * 1.05).translate(0.004, -0.018, 0);
  const steerer = new THREE.CylinderGeometry(0.0143, 0.019, 0.3, 16).translate(0, 0.15, 0);
  for (const [name, geo] of [["blades", blades], ["crown", crown], ["steerer_tube", steerer]] as const) {
    const m = new THREE.Mesh(geo, mat);
    m.name = `${f.key.replace(/-/g, "_")}_${name}`;
    g.add(m);
  }
  const decl: AssetDeclaration = {
    spec: "velox-assembly/1",
    key: f.key,
    version: 1,
    kind: "fork",
    label: f.label,
    representation: "representative",
    categories: f.categories,
    units: "m",
    mounts: { crown_race: iface(g, "MNT__", "crown_race", "tube", [0, 0, 0], [0, -1, 0], { standard: f.steerer }) },
    anchors: {
      steerer: iface(g, "ANC__", "steerer", "tube", [0, 0.3, 0], [0, 1, 0]),
      front_axle: iface(g, "ANC__", "front_axle", "axle", axle, [0, 0, 1], { standard: f.axle }),
      front_brake: iface(g, "ANC__", "front_brake", "face", [axle[0] - 0.03, axle[1] + 0.06, -half], [0, 0, -1], { standard: "flat_mount_140" }),
    },
    measured: { axle_to_crown_mm: f.a2c, offset_mm: f.offset },
    materials: { MAT__paint_secondary: "paint_secondary" },
    license: { id: "LicenseRef-VELOX-demo", attribution: "VELOX demo asset (fictional fork)" },
    author: f.author,
    source: "scripts/assets/authors/forks-demo.mts",
    demo: true,
  };
  await exportAsset(g, decl);
}
