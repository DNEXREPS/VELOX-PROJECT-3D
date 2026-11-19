/**
 * velox-assembly/1 — resolver, attachment maths, generators, 2D projection, revision refs.
 * Uses the real pipeline manifest (public/lab-assets) of the P0 prototype assets.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { resolveAssembly } from "@/lib/assembly/resolve";
import { attachPose, checkInterfacePose, distance, interfaceFrame, multiply, rotationDeltaDeg, transformPoint } from "@/lib/assembly/math";
import { buildTire, buildWheel, resolveTire, resolveWheel, TIRE_HEIGHT_RATIO } from "@/lib/assembly/generators";
import { geometryFingerprint, hash64 } from "@/lib/assembly/fingerprint";
import { projectSide, projectionRadii } from "@/lib/assembly/projection2d";
import { CATEGORY_PROFILES, FRAME_TEMPLATES, TOLERANCE } from "@/lib/assembly/conventions";
import { validateAsset, type MeasuredFile } from "@/lib/assembly/validate";
import type { AssemblyInput, AssemblySpec, AssetManifest, CategoryTarget, PartInput } from "@/lib/assembly/spec";

const manifest = JSON.parse(readFileSync(join(__dirname, "../../public/lab-assets/manifest.json"), "utf8")) as AssetManifest;
const asset = (key: string): PartInput["visual"] => ({ kind: "asset", key, version: 1 });

function build(o: { category?: CategoryTarget; frame?: string | null; fork?: string | null; wheel?: string | null; front?: number | null; rear?: number | null } = {}): AssemblyInput {
  const c = { category: "road" as CategoryTarget, frame: "frame-road-demo", fork: "fork-road-demo", wheel: "700c", front: 28, rear: 28, ...o };
  const tire = (slot: "front_tire" | "rear_tire", w: number | null): PartInput => ({ slot, name: `tire ${w}`, visual: { kind: "generator", generator: "tire", version: 1 }, dims: { wheel_size: c.wheel ?? undefined, width_mm: w ?? undefined } });
  return {
    category: c.category,
    parts: {
      frame: { slot: "frame", name: c.frame ?? "unbound frame", visual: c.frame ? asset(c.frame) : null, dims: {} },
      fork: { slot: "fork", name: c.fork ?? "unbound fork", visual: c.fork ? asset(c.fork) : null, dims: {} },
      wheelset: { slot: "wheelset", name: "wheels", visual: { kind: "generator", generator: "wheel", version: 1 }, dims: { wheel_size: c.wheel ?? undefined } },
      front_tire: tire("front_tire", c.front),
      rear_tire: tire("rear_tire", c.rear),
    },
  };
}
const node = (s: AssemblySpec, id: string) => s.nodes.find((n) => n.id === id)!;

describe("attachment maths", () => {
  it("places the part so its mount frame coincides with the anchor frame (≤ 0.1 mm, ≤ 0.05°)", () => {
    const anchor = interfaceFrame("tube", [0.42, 0.68, 0], [0.29, -0.957, 0]);
    const mount = interfaceFrame("tube", [0, 0, 0], [0, -1, 0]);
    for (const [slide, angle] of [[0, 0], [0.012, 0], [0, 0.3]] as const) {
      const local = attachPose(anchor, mount, slide, angle);
      const mountWorld = multiply(local, mount);
      const expected = multiply(anchor, { t: [0, 0, slide], r: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle).toArray() as [number, number, number, number] });
      expect(distance(mountWorld.t, expected.t)).toBeLessThan(TOLERANCE.attachPositionM);
      expect(rotationDeltaDeg(mountWorld.r, expected.r)).toBeLessThan(TOLERANCE.attachAngleDeg);
    }
  });

  it("enforces the interface axis conventions", () => {
    expect(checkInterfacePose("ok", "axle", interfaceFrame("axle", [0, 0.3, 0], [0, 0, 1]))).toEqual([]);
    expect(checkInterfacePose("flipped", "axle", interfaceFrame("axle", [0, 0.3, 0], [0, 0, -1]))[0]).toMatch(/drive side/);
    expect(checkInterfacePose("tube", "tube", interfaceFrame("tube", [0, 0, 0], [0, 0.3, 0.2]))[0]).toMatch(/centre plane/);
    expect(checkInterfacePose("left pedal", "thread", interfaceFrame("thread", [0, 0, -0.08], [0, 0, -1]), "non_drive")).toEqual([]);
  });
});

describe("assembly of independently authored parts", () => {
  const road = resolveAssembly(build(), manifest);

  it("assembles the road build: every node resolved, mounts on anchors, both tires on the ground", () => {
    expect(road.nodes.map((n) => `${n.id}:${n.status}`)).toEqual(["frame:ok", "fork:ok", "wheel_front:ok", "wheel_rear:ok", "tire_front:ok", "tire_rear:ok"]);
    const frame = node(road, "frame");
    const fork = node(road, "fork");
    // Fork crown race (mount) coincides with the frame's lower head-tube anchor in world space.
    const forkEntry = manifest.assets.find((a) => a.key === "fork-road-demo")!;
    const frameEntry = manifest.assets.find((a) => a.key === "frame-road-demo")!;
    const mountWorld = multiply(fork.world!, forkEntry.mounts.crown_race.pose);
    const anchorWorld = multiply(frame.world!, frameEntry.anchors.head_lower.pose);
    expect(distance(mountWorld.t, anchorWorld.t)).toBeLessThan(TOLERANCE.attachPositionM);
    expect(rotationDeltaDeg(mountWorld.r, anchorWorld.r)).toBeLessThan(TOLERANCE.attachAngleDeg);
    // Ground contact: axle height equals tire outer radius on both wheels.
    for (const id of ["front", "rear"]) {
      const t = node(road, `tire_${id}`).source as { params: Record<string, number> };
      expect(Math.abs(node(road, `wheel_${id}`).world!.t[1] - (t.params.bsd_mm / 2 + t.params.height_mm) / 1000)).toBeLessThan(TOLERANCE.groundContactM);
    }
    expect(road.warnings).toEqual([]);
    expect(road.derived.bbHeightMm).toBeGreaterThan(250);
    expect(road.derived.bbHeightMm).toBeLessThan(290);
    expect(road.derived.wheelbaseMm).toBeGreaterThan(950);
  });

  it("replacing the fork changes the actual geometry and everything downstream of it", () => {
    const gravelFork = resolveAssembly(build({ fork: "fork-gravel-demo" }), manifest);
    const before = node(road, "fork");
    const after = node(gravelFork, "fork");
    expect(after.source).toMatchObject({ kind: "asset", key: "fork-gravel-demo" });
    const fp = (key: string) => manifest.assets.find((a) => a.key === key)!.geometryFingerprint;
    expect(fp("fork-gravel-demo")).not.toBe(fp("fork-road-demo"));
    expect(gravelFork.fingerprint).not.toBe(road.fingerprint);
    // 25 mm longer axle-to-crown + 5 mm more offset: front end rises, frame pitches nose-up, wheelbase grows.
    expect(gravelFork.derived.pitchDeg!).toBeGreaterThan(road.derived.pitchDeg!);
    expect(gravelFork.derived.wheelbaseMm!).toBeGreaterThan(road.derived.wheelbaseMm!);
    expect(node(gravelFork, "wheel_front").world!.t[0]).not.toBeCloseTo(node(road, "wheel_front").world!.t[0], 3);
    expect(before.source).not.toEqual(after.source);
  });

  it("changing tire width regenerates the tire and raises the bike by the real radius change", () => {
    const wide = resolveAssembly(build({ front: 45, rear: 45 }), manifest);
    const p28 = (node(road, "tire_rear").source as { params: Record<string, number> }).params;
    const p45 = (node(wide, "tire_rear").source as { params: Record<string, number> }).params;
    expect(p45.width_mm).toBe(45);
    expect(geometryFingerprint(buildTire(p45).map((g) => ({ name: g.name, positions: g.geometry.getAttribute("position").array })))).not.toBe(
      geometryFingerprint(buildTire(p28).map((g) => ({ name: g.name, positions: g.geometry.getAttribute("position").array }))),
    );
    const expectedRise = (45 - 28) * TIRE_HEIGHT_RATIO;
    expect(wide.derived.bbHeightMm! - road.derived.bbHeightMm!).toBeCloseTo(expectedRise, 0);
  });

  it("a different frame geometry is a different bike: the hardtail resolves with its own anchors", () => {
    const ht = resolveAssembly(build({ category: "mtb_hardtail", frame: "frame-hardtail-demo", fork: "fork-mtb-rigid-demo", wheel: "29", front: 60, rear: 60 }), manifest);
    expect(ht.nodes.every((n) => n.status === "ok")).toBe(true);
    expect(ht.template).toBe("hardtail");
    expect(ht.derived.wheelbaseMm!).toBeGreaterThan(road.derived.wheelbaseMm! + 100);
    // Steering axis in world = design head angle minus the frame pitch (nose-down pitch steepens it).
    const frameEntry = manifest.assets.find((a) => a.key === "frame-hardtail-demo")!;
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...multiply(node(ht, "frame").world!, frameEntry.anchors.head_upper.pose).r));
    expect(THREE.MathUtils.radToDeg(Math.atan2(z.y, -z.x))).toBeCloseTo(65.5 - ht.derived.pitchDeg!, 1);
  });

  it("reports interface mismatches but still renders exactly what is configured", () => {
    const mixed = resolveAssembly(build({ category: "mtb_hardtail", frame: "frame-hardtail-demo", fork: "fork-road-demo", wheel: "29" }), manifest);
    expect(node(mixed, "fork").status).toBe("ok");
    expect(mixed.warnings.some((w) => w.startsWith("interface_mismatch:head_lower"))).toBe(true);
  });
});

describe("no guessed data, no stale geometry", () => {
  it("a tire without a recorded width has no geometry and says which dimension is missing", () => {
    const s = resolveAssembly(build({ front: null }), manifest);
    const t = node(s, "tire_front");
    expect(t).toMatchObject({ status: "missing_dimensions", representation: "none", source: null, missing: ["width_mm"] });
    expect(s.revision.front_tire).toEqual({ representation: "none", reason: "missing_dimensions" });
    // The front still touches the ground — on the rim, with the rim's real radius.
    expect(node(s, "wheel_front").world!.t[1]).toBeCloseTo(0.311, 4);
  });

  it("a wheelset without a size produces no wheels and no tires (nothing is inferred)", () => {
    const s = resolveAssembly(build({ wheel: null }), manifest);
    expect(node(s, "wheel_front")).toMatchObject({ status: "missing_dimensions", missing: ["bsd_mm"] });
    expect(node(s, "tire_front").status).toBe("missing_dimensions");
  });

  it("replacing a part with one that has no 3D model removes the old geometry (and its dependants)", () => {
    const s = resolveAssembly(build({ fork: null }), manifest);
    expect(node(s, "fork")).toMatchObject({ status: "no_visual", source: null, representation: "none" });
    expect(node(s, "wheel_front").status).toBe("host_unavailable");
    expect(node(s, "tire_front").status).toBe("host_unavailable");
    expect(s.revision.fork).toEqual({ representation: "none", reason: "no_visual" });
  });

  it("generators reject absurd values instead of building them", () => {
    expect(resolveTire({ width_mm: 1000, bsd_mm: 622 }).missing).toEqual(["width_mm"]);
    expect(resolveWheel({ bsd_mm: 5000 }, "front").ok).toBe(false);
  });

  it("generated parts list the representation choices they made", () => {
    const w = resolveWheel({ bsd_mm: 622 }, "rear");
    expect(w.assumptions.join(" ")).toMatch(/Rim depth not recorded/);
    expect(resolveTire({ width_mm: 28, bsd_mm: 622, outer_diameter_mm: 680 }).assumptions.join(" ")).not.toMatch(/casing height modelled/);
  });
});

describe("categories are not one universal bicycle", () => {
  it("each target has its own template and anchor set", () => {
    expect(CATEGORY_PROFILES.folding.template).toBe("folding");
    expect(FRAME_TEMPLATES.folding.requiredAnchors).toContain("handlepost");
    expect(FRAME_TEMPLATES.folding.requiredAnchors).not.toContain("head_upper");
    expect(FRAME_TEMPLATES.diamond.requiredAnchors).not.toContain("handlepost");
    expect(CATEGORY_PROFILES.folding.bsdMm).toEqual([349, 406, 451]);
  });

  it("a frame is only accepted for the categories and template it was authored for", () => {
    for (const category of ["folding", "gravel", "mtb_hardtail"] as const) {
      const s = resolveAssembly(build({ category }), manifest);
      expect(node(s, "frame").status, category).toBe("invalid_binding");
      expect(node(s, "fork").status, category).toBe("host_unavailable");
    }
  });
});

describe("one description for 3D, 2D and history", () => {
  it("the 2D projection is derived from the same spec and changes with a replacement", () => {
    const a = resolveAssembly(build(), manifest);
    const b = resolveAssembly(build({ fork: "fork-gravel-demo" }), manifest);
    const front = (s: AssemblySpec) => projectSide(s, projectionRadii(s)).find((p) => p.kind === "circle" && p.nodeId === "tire_front") as { cx: number; cy: number };
    expect(front(b).cx).not.toBeCloseTo(front(a).cx, 3);
    const missing = projectSide(resolveAssembly(build({ front: null }), manifest), {}).filter((p) => p.kind === "missing");
    expect(missing).toEqual([expect.objectContaining({ nodeId: "tire_front", reason: "missing_dimensions" })]);
  });

  it("revision refs pin asset version + SHA-256 and generator params, and reproduce the same assembly", () => {
    const s = resolveAssembly(build({ fork: "fork-gravel-demo", front: 32 }), manifest);
    const forkEntry = manifest.assets.find((a) => a.key === "fork-gravel-demo")!;
    expect(s.revision.fork).toEqual({ representation: "representative", asset: { key: "fork-gravel-demo", version: 1, sha256: forkEntry.sha256 } });
    const tire = s.revision.front_tire as Extract<NonNullable<AssemblySpec["revision"]["front_tire"]>, { representation: "generated" }>;
    expect(tire.generator).toMatchObject({ id: "tire", version: 1, params: { width_mm: 32, bsd_mm: 622 } });
    expect(tire.generator.paramsHash).toMatch(/^[0-9a-f]{16}$/);
    // Re-resolving the same stored configuration yields the identical fingerprint.
    expect(resolveAssembly(build({ fork: "fork-gravel-demo", front: 32 }), manifest).fingerprint).toBe(s.fingerprint);
  });

  it("generator output is deterministic", () => {
    const fp = () => geometryFingerprint(buildWheel(resolveWheel({ bsd_mm: 584, spoke_count: 28 }, "front").params).map((g) => ({ name: g.name, positions: g.geometry.getAttribute("position").array, indices: g.geometry.getIndex()?.array })));
    expect(fp()).toBe(fp());
    expect(hash64("velox")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("world anchor positions are consistent with the node pose", () => {
    const s = resolveAssembly(build(), manifest);
    const f = node(s, "frame");
    const entry = manifest.assets.find((a) => a.key === "frame-road-demo")!;
    expect(distance(f.anchorsWorld.bb, transformPoint(f.world!, entry.anchors.bb.pose.t))).toBe(0);
  });
});

describe("asset contract validation", () => {
  const entry = manifest.assets.find((a) => a.key === "fork-road-demo")!;
  const okFile = (): MeasuredFile => ({
    nodeNames: ["MNT__crown_race", "ANC__steerer", "ANC__front_axle", "ANC__front_brake", "fork_blades"],
    meshNodeNames: ["fork_blades"],
    multiPrimitiveNodes: [],
    materialNames: ["MAT__paint_secondary"],
    nodePoses: { MNT__crown_race: entry.mounts.crown_race.pose, ANC__steerer: entry.anchors.steerer.pose, ANC__front_axle: entry.anchors.front_axle.pose, ANC__front_brake: entry.anchors.front_brake.pose },
    triangles: 200,
    strings: ["fork_blades"],
  });
  const decl = () => JSON.parse(JSON.stringify(entry));

  it("accepts a conforming asset", () => {
    expect(validateAsset(decl(), okFile())).toEqual([]);
  });

  it("rejects reserved characters, missing interfaces, wrong measurements, budgets, privacy leaks and false exact claims", () => {
    const f = okFile();
    f.nodeNames.push("Blade.001");
    expect(validateAsset(decl(), f).join("\n")).toMatch(/reserved characters/);
    const noAxle = decl();
    delete noAxle.anchors.front_axle;
    expect(validateAsset(noAxle, okFile()).join("\n")).toMatch(/missing required anchor front_axle/);
    const wrong = decl();
    wrong.measured.axle_to_crown_mm = 400;
    expect(validateAsset(wrong, okFile()).join("\n")).toMatch(/axle_to_crown_mm = 400/);
    const big = okFile();
    big.triangles = 50_000;
    expect(validateAsset(decl(), big).join("\n")).toMatch(/budget/);
    const leak = okFile();
    leak.strings.push("exported by rider@example.com from /home/alice/bike.blend");
    expect(validateAsset(decl(), leak).join("\n")).toMatch(/privacy/);
    const exact = decl();
    exact.representation = "exact";
    expect(validateAsset(exact, okFile()).join("\n")).toMatch(/exact representation requires/);
    const moved = okFile();
    moved.nodePoses.ANC__front_axle = { ...moved.nodePoses.ANC__front_axle, t: [0.046, -0.37, 0] };
    expect(validateAsset(decl(), moved).join("\n")).toMatch(/position differs from declaration/);
  });
});
