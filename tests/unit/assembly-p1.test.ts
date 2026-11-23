/**
 * P1 — modular studio assembly: full road / hardtail builds from the temporary demo links,
 * real replacement effects on geometry and measurements, explicit missing/unavailable
 * states, 2D from the same spec, budgets and revision references.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { resolveAssembly } from "@/lib/assembly/resolve";
import { distance, transformPoint } from "@/lib/assembly/math";
import { GENERATORS, sprocketRadius, STEM_STACK_MM } from "@/lib/assembly/generators";
import { chainPath } from "@/lib/assembly/generators/drivetrain";
import { projectSide } from "@/lib/assembly/projection2d";
import { TOLERANCE } from "@/lib/assembly/conventions";
import type { AssemblySpec, AssetManifest } from "@/lib/assembly/spec";
import { LAB_PRESETS, labInput, type LabConfig } from "@/features/lab/lab-config";
import { LAB_PARTS } from "@/features/lab/lab-parts";
import { DEMO_VISUAL_LINKS, engineTarget, parseEtrto, recordedDims, toPartInput } from "@/features/studio/assembly/demo-bindings";
import type { BikeSlot } from "@/lib/domain/slots";
import { checkConfiguration, type CheckResult } from "@/lib/compatibility";

const manifest = JSON.parse(readFileSync(join(__dirname, "../../public/model-assets/manifest.json"), "utf8")) as AssetManifest;
const resolve = (c: LabConfig) => resolveAssembly(labInput(c), manifest);
const swap = (base: LabConfig, parts: Partial<Record<BikeSlot, string | null>>): LabConfig => ({ ...base, parts: { ...base.parts, ...parts } });
const node = (s: AssemblySpec, id: string) => {
  const n = s.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const gen = (r: AssemblySpec["revision"][BikeSlot]) => (r && "generator" in r ? r.generator : undefined);
const road = resolve(LAB_PRESETS.road);
const hardtail = resolve(LAB_PRESETS.hardtail);

describe("full builds from the demo links", () => {
  it.each([["road", road], ["hardtail", hardtail]] as const)("%s: every modelled slot resolves with an honest representation", (_, spec) => {
    for (const n of spec.nodes) expect([n.id, n.status, n.warnings]).toEqual([n.id, "ok", []]);
    const rep = Object.fromEntries(spec.nodes.map((n) => [n.id, n.representation]));
    for (const id of ["wheel_front", "wheel_rear", "tire_front", "tire_rear", "stem", "handlebar", "seatpost", "crankset", "cassette", "chain", "rotor_front", "rotor_rear"]) expect(rep[id]).toBe("generated");
    // Authored demo frames/forks are representative — never "exact".
    expect(rep.frame).toBe("representative");
    expect(rep.fork).toBe("representative");
    expect(spec.warnings).toEqual([]);
  });

  it("puts both tires on the ground and the frame level within tolerance", () => {
    for (const spec of [road, hardtail]) {
      for (const [w, t] of [["wheel_front", "tire_front"], ["wheel_rear", "tire_rear"]]) {
        const R = (node(spec, t).source as { params: Record<string, number> }).params;
        const wheelY = node(spec, w).world!.t[1];
        const outer = (R.bsd_mm / 2 + R.height_mm) / 1000;
        expect(Math.abs(wheelY - outer)).toBeLessThan(TOLERANCE.groundContactM);
      }
    }
  });

  it("shows the handlebar level (drops/grips hang straight down)", () => {
    for (const spec of [road, hardtail]) {
      const q = new THREE.Quaternion(...node(spec, "handlebar").world!.r);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      expect(Math.abs(up.x)).toBeLessThan(1e-6);
      expect(up.y).toBeGreaterThan(0.999);
    }
  });

  it("labels frame-derived measurements as estimates (no recorded geometry chart)", () => {
    for (const k of ["bbHeightMm", "wheelbaseMm", "barClampMm", "saddleClampMm", "lowestPedalMm"] as const) {
      expect(road.derivedQuality[k].quality).toBe("estimate");
      expect(road.derivedQuality[k].notes.join(" ")).toMatch(/representative model/);
    }
    expect(road.derivedQuality.barClampMm.notes).toContain("Headset/spacer stack not recorded");
    expect(road.derivedQuality.saddleClampMm.notes).toContain("Saddle height not recorded (fit data)");
  });

  it("is deterministic (same input → same fingerprint and revision refs)", () => {
    const again = resolve(LAB_PRESETS.road);
    expect(again.fingerprint).toBe(road.fingerprint);
    expect(again.revision).toEqual(road.revision);
  });
});

describe("replacements change the right geometry and measurements", () => {
  it("crank length 170 → 175 lowers the pedal by exactly 5 mm and changes nothing else", () => {
    const a = resolve(swap(LAB_PRESETS.hardtail, { crankset: "demo-m12-crankset-170-32" }));
    const b = resolve(swap(LAB_PRESETS.hardtail, { crankset: "demo-m12-crankset-175-30" }));
    expect(a.derived.lowestPedalMm! - b.derived.lowestPedalMm!).toBeCloseTo(5, 6);
    expect(b.derived.bbHeightMm).toBe(a.derived.bbHeightMm);
    expect(b.derived.wheelbaseMm).toBe(a.derived.wheelbaseMm);
    expect(b.fingerprint).not.toBe(a.fingerprint);
    // Pedal thread in the crank plane (x/y), excluding the lateral q-factor offset.
    const pedal = (s: AssemblySpec) => {
      const [px, py] = node(s, "crankset").anchorsWorld.pedal_r;
      const [cx, cy] = node(s, "crankset").world!.t;
      return Math.hypot(px - cx, py - cy);
    };
    expect(pedal(a)).toBeCloseTo(0.17, 9);
    expect(pedal(b)).toBeCloseTo(0.175, 9);
  });

  it("stem/handlebar clamp mismatch is reported from recorded clamp diameters", () => {
    const s = resolve(swap(LAB_PRESETS.road, { stem: "demo-alloy-stem-90-35" }));
    expect(node(s, "handlebar").warnings).toEqual(["interface_mismatch:bar_clamp: part 31.8 ≠ host 35"]);
    expect(node(road, "handlebar").warnings).toEqual([]);
  });

  it("stem length/angle put the bar clamp exactly at the recorded length from the steerer axis", () => {
    for (const stemKey of ["demo-alloy-stem-100", "demo-alloy-stem-90-35"]) {
      const s = resolve(swap(LAB_PRESETS.road, { stem: stemKey }));
      const n = node(s, "stem");
      const params = (n.source as { params: Record<string, number> }).params;
      const axisPoint = transformPoint(n.world!, [0, STEM_STACK_MM / 2000, 0]);
      expect(distance(axisPoint, n.anchorsWorld.bar_clamp)).toBeCloseTo(params.length_mm / 1000, 9);
      // The handlebar mount coincides with the stem's bar clamp anchor.
      expect(distance(node(s, "handlebar").world!.t, n.anchorsWorld.bar_clamp)).toBeLessThan(TOLERANCE.attachPositionM);
    }
    const s100 = resolve(swap(LAB_PRESETS.road, { stem: "demo-alloy-stem-100" }));
    const s90 = resolve(swap(LAB_PRESETS.road, { stem: "demo-alloy-stem-90-35" }));
    // Shorter and steeper-down stem → bar further back and lower.
    expect(s90.derived.barClampMm!.x).toBeLessThan(s100.derived.barClampMm!.x);
    expect(s90.derived.barClampMm!.y).toBeLessThan(s100.derived.barClampMm!.y);
    expect(s90.derived.lowestPedalMm).toBe(s100.derived.lowestPedalMm);
  });

  it("cassette cogs and chainrings use the sprocket pitch-circle formula; the chain follows", () => {
    const cas = node(road, "cassette").source as unknown as { params: { cogs: number[] } };
    expect(cas.params.cogs[0]).toBe(34);
    expect(sprocketRadius(34)).toBeCloseTo(0.0127 / (2 * Math.sin(Math.PI / 34)), 12);
    const chain = (node(road, "chain").source as { params: Record<string, number> }).params;
    expect(chain.cog_r).toBeCloseTo(sprocketRadius(11) * 1000, 1);
    expect(chain.ring_r).toBeCloseTo(sprocketRadius(50) * 1000, 1);
    const other = resolve(swap(LAB_PRESETS.road, { cassette: "demo-r11-cassette-11-28", chain: "demo-r11-chain" }));
    expect((node(other, "cassette").source as unknown as { params: { cogs: number[] } }).params.cogs[0]).toBe(28);
    expect(other.fingerprint).not.toBe(road.fingerprint);
  });

  it("chain path wraps both sprockets at their pitch radius", () => {
    const p = (node(road, "chain").source as { params: Record<string, number> }).params;
    const pts = chainPath(p);
    const ring = new THREE.Vector2(p.ring_x / 1000, p.ring_y / 1000);
    const cog = new THREE.Vector2(p.cog_x / 1000, p.cog_y / 1000);
    const onRing = pts.filter((v) => Math.abs(new THREE.Vector2(v.x, v.y).distanceTo(ring) - p.ring_r / 1000) < 1e-9).length;
    const onCog = pts.filter((v) => Math.abs(new THREE.Vector2(v.x, v.y).distanceTo(cog) - p.cog_r / 1000) < 1e-9).length;
    expect(onRing).toBeGreaterThan(40);
    expect(onCog).toBeGreaterThan(15);
    // Long arc round the front of the ring: some point is ahead of the ring centre.
    expect(Math.max(...pts.map((v) => v.x))).toBeCloseTo(ring.x + p.ring_r / 1000, 3);
    // Short arc round the back of the cog.
    expect(Math.min(...pts.map((v) => v.x))).toBeCloseTo(cog.x - p.cog_r / 1000, 3);
  });

  it("rotor 160 → 140 changes the rotor radius; front and rear are independent", () => {
    const s = resolve(swap(LAB_PRESETS.road, { front_rotor: "demo-rotor-140-centerlock" }));
    const r = (spec: AssemblySpec, id: string) => (projectSide(spec).find((p) => p.nodeId === id && p.kind === "circle") as { r: number }).r;
    expect(r(road, "rotor_front")).toBeCloseTo(0.08, 9);
    expect(r(s, "rotor_front")).toBeCloseTo(0.07, 9);
    expect(r(s, "rotor_rear")).toBeCloseTo(0.08, 9);
    // The rotor sits on the hub's rotor anchor (non-drive side).
    expect(node(s, "rotor_front").world!.t[2]).toBeLessThan(0);
  });

  it("tire width changes wheel radius, ground contact and bike height", () => {
    const wide = resolve(swap(LAB_PRESETS.road, { front_tire: "demo-road-tire-700x32", rear_tire: "demo-road-tire-700x32#rear" }));
    expect(node(wide, "wheel_rear").world!.t[1]).toBeGreaterThan(node(road, "wheel_rear").world!.t[1]);
    expect(wide.derived.bbHeightMm!).toBeGreaterThan(road.derived.bbHeightMm!);
    expect(wide.derived.lowestPedalMm! - road.derived.lowestPedalMm!).toBeCloseTo(wide.derived.bbHeightMm! - road.derived.bbHeightMm!, 1);
  });

  it("removing a part removes its node and anything that depends on it", () => {
    const s = resolve(swap(LAB_PRESETS.road, { cassette: null }));
    expect(s.nodes.find((n) => n.id === "cassette")).toBeUndefined();
    expect(node(s, "chain").status).toBe("host_unavailable");
    expect(s.revision.chain).toEqual({ representation: "none", reason: "host_unavailable" });
  });
});

describe("missing data is explicit — nothing is guessed or borrowed", () => {
  it("carbon drop bar without recorded drop → missing_dimensions", () => {
    const s = resolve(swap(LAB_PRESETS.road, { handlebar: "demo-carbon-drop-bar-400" }));
    const bar = node(s, "handlebar");
    expect(bar.status).toBe("missing_dimensions");
    expect(bar.missing).toEqual(["drop_mm"]);
    expect(bar.representation).toBe("none");
    expect(s.derivedQuality.barClampMm.quality).toBe("estimate"); // falls back to the stem's clamp anchor
    expect(s.revision.handlebar?.representation).toBe("none");
  });

  it("flared gravel bar without reach or drop → both listed", () => {
    const s = resolve(swap(LAB_PRESETS.road, { handlebar: "demo-flared-gravel-bar-440" }));
    expect(node(s, "handlebar").missing.sort()).toEqual(["drop_mm", "reach_mm"]);
  });

  it("rim-brake wheelset has no rotor mount → rotors are host_unavailable", () => {
    const s = resolve(swap(LAB_PRESETS.road, { wheelset: "demo-alloy-rim-brake-wheelset" }));
    expect(node(s, "rotor_front").status).toBe("host_unavailable");
    expect(node(s, "rotor_rear").status).toBe("host_unavailable");
    expect(node(s, "wheel_front").status).toBe("ok");
  });

  it("unlinked catalog components have no 3D representation (no substitution)", () => {
    const s = resolve(swap(LAB_PRESETS.road, { fork: "demo-steel-rim-fork" }));
    const fork = node(s, "fork");
    expect(fork.status).toBe("no_visual");
    expect(fork.representation).toBe("none");
    expect(fork.source).toBeNull();
    // Dependent wheel cannot be placed without a fork.
    expect(node(s, "wheel_front").status).toBe("host_unavailable");
    expect(s.derivedQuality.wheelbaseMm.quality).toBe("unavailable");
  });

  it("a road frame is rejected for a hardtail build", () => {
    const s = resolve(swap(LAB_PRESETS.hardtail, { frame: "demo-endurance-carbon-disc-frame" }));
    expect(node(s, "frame").status).toBe("invalid_binding");
    expect(node(s, "frame").warnings[0]).toMatch(/frame-road-demo .* for road; this bike is Hardtail MTB/);
  });
});

describe("2D side view comes from the same spec as 3D", () => {
  it("every OK node yields primitives transformed by its world pose", () => {
    for (const spec of [road, hardtail]) {
      const prims = projectSide(spec);
      for (const n of spec.nodes) expect(prims.some((p) => p.nodeId === n.id && p.kind !== "missing")).toBe(true);
      const wheel = node(spec, "wheel_rear");
      const circle = prims.find((p) => p.nodeId === "wheel_rear" && p.kind === "circle") as { cx: number; cy: number };
      expect(circle.cx).toBeCloseTo(wheel.world!.t[0], 9);
      expect(circle.cy).toBeCloseTo(wheel.world!.t[1], 9);
    }
  });

  it("replacements change the 2D view the same way (crank length)", () => {
    const b = resolve(swap(LAB_PRESETS.hardtail, { crankset: "demo-m12-crankset-175-30" }));
    const arm = (s: AssemblySpec) => {
      const p = projectSide(s).find((x) => x.nodeId === "crankset" && x.kind === "polyline") as { points: [number, number][] };
      return Math.hypot(p.points[1][0] - p.points[0][0], p.points[1][1] - p.points[0][1]) / 2;
    };
    expect(arm(hardtail)).toBeCloseTo(0.17, 9);
    expect(arm(b)).toBeCloseTo(0.175, 9);
  });

  it("missing parts are drawn as explicit 'missing' primitives", () => {
    const s = resolve(swap(LAB_PRESETS.road, { handlebar: "demo-carbon-drop-bar-400" }));
    expect(projectSide(s).find((p) => p.nodeId === "handlebar")).toMatchObject({ kind: "missing", reason: "missing_dimensions" });
  });
});

describe("budgets", () => {
  it.each([["road", road], ["hardtail", hardtail]] as const)("%s: ≤150k triangles and ≤120 draw calls", (_, spec) => {
    let tris = 0;
    let calls = 0;
    for (const n of spec.nodes) {
      if (n.status !== "ok" || !n.source) continue;
      if (n.source.kind === "generator") {
        for (const part of GENERATORS[n.source.generator].build(n.source.params)) {
          const g = part.geometry;
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          calls += 1;
        }
      } else {
        const key = n.source.key;
        const e = manifest.assets.find((a) => a.key === key)!;
        tris += e.triangles;
        calls += Math.max(1, Object.keys(e.materials).length);
      }
    }
    expect(tris).toBeLessThanOrEqual(150_000);
    expect(calls).toBeLessThanOrEqual(120);
  });
});

describe("demo catalogue → 3D adapters", () => {
  it("parses ETRTO", () => {
    expect(parseEtrto("28-622")).toEqual({ width: 28, bsd: 622 });
    expect(parseEtrto(" 47 - 584 ")).toEqual({ width: 47, bsd: 584 });
    expect(parseEtrto("700x28c")).toEqual({});
    expect(parseEtrto(undefined)).toEqual({});
  });

  it("reads only recorded dimensions", () => {
    const bar = LAB_PARTS["demo-carbon-drop-bar-400"].part;
    expect(recordedDims("handlebar", bar)).toMatchObject({ width_mm: 400, reach_mm: 75, drop_mm: undefined, clamp_mm: 31.8 });
    expect(recordedDims("crankset", LAB_PARTS["demo-r12-crankset-50-34"].part)).toMatchObject({ crank_length_mm: 172.5, chainrings: "50,34" });
    expect(recordedDims("rotor", LAB_PARTS["demo-rotor-140-centerlock"].part)).toEqual({ diameter_mm: 140 });
  });

  it("custom and unlinked parts get no visual", () => {
    const part = LAB_PARTS["demo-alloy-stem-100"].part;
    expect(toPartInput("stem", part)?.visual).toMatchObject({ kind: "generator", generator: "stem" });
    expect(toPartInput("stem", part, true)?.visual).toBeNull();
    expect(toPartInput("stem", { ...part, componentSlug: "not-linked" })?.visual).toBeNull();
    expect(toPartInput("stem", null)).toBeUndefined();
  });

  it("maps bike categories to supported engine targets only", () => {
    expect(engineTarget("road")).toBe("road");
    expect(engineTarget("mountain")).toBe("mtb_hardtail");
    for (const c of ["gravel", "hybrid", "bmx", null, undefined]) expect(engineTarget(c)).toBeNull();
  });
});

describe("revision references", () => {
  it("record generator id, version, params and hash for every P1 slot", () => {
    for (const slot of ["stem", "handlebar", "seatpost", "crankset", "cassette", "chain", "front_rotor", "rear_rotor"] as const) {
      const ref = road.revision[slot]!;
      expect(ref.representation).toBe("generated");
      expect(gen(ref)?.version).toBeGreaterThan(0);
      expect(gen(ref)?.paramsHash).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(gen(road.revision.handlebar)?.variant).toBe("drop");
    expect(gen(hardtail.revision.handlebar)?.variant).toBe("flat");
    expect(road.revision.fork && "asset" in road.revision.fork ? road.revision.fork.asset : null).toMatchObject({ key: "fork-demo-carbon-disc", version: 1 });
  });

  it("change when a replacement changes geometry", () => {
    const s = resolve(swap(LAB_PRESETS.road, { stem: "demo-alloy-stem-90-35" }));
    expect(gen(s.revision.stem)?.paramsHash).not.toBe(gen(road.revision.stem)?.paramsHash);
    expect(s.revision.crankset).toEqual(road.revision.crankset);
  });
});

// ---------------------------------------------------------------------------------------
// MTB hardtail demo (catalogue parts, P1 MTB expansion)
// ---------------------------------------------------------------------------------------
const compat = (c: LabConfig): CheckResult[] =>
  checkConfiguration(
    Object.entries(c.parts)
      .filter(([, k]) => k && LAB_PARTS[k])
      .map(([slot, k]) => ({ slot: slot as BikeSlot, name: LAB_PARTS[k!].part.name, attributes: LAB_PARTS[k!].part.attributes })),
  );
const incompatible = (c: LabConfig) => compat(c).filter((r) => r.status === "incompatible").map((r) => r.ruleId).sort();
const MTB = LAB_PRESETS.hardtail;
const params = (s: AssemblySpec, id: string) => (node(s, id).source as unknown as { params: Record<string, number | number[]> }).params;

describe("MTB hardtail demo build", () => {
  it("is made only of seeded demo catalogue parts (no lab-only parts)", () => {
    for (const key of Object.values(MTB.parts)) {
      const lp = LAB_PARTS[key!];
      expect(lp, key!).toBeDefined();
      expect(lp.part.componentSlug).toBe(key!.replace(/#rear$/, ""));
    }
  });

  it("is fully compatible according to the compatibility engine", () => {
    expect(incompatible(MTB)).toEqual([]);
    const ids = new Set(compat(MTB).map((r) => r.ruleId));
    for (const id of ["bb-shell", "rear-axle", "front-axle", "freehub", "rotor-mount", "front-rotor-size", "rear-rotor-size", "headset-standard", "stem-steerer", "bar-clamp", "speed-cassette-chain", "speed-crank-chain", "seatpost-diameter"]) expect(ids, id).toContain(id);
  });

  it("frame and forks: representative models; fork geometry built to the recorded axle-to-crown/offset", () => {
    expect(node(hardtail, "frame").representation).toBe("representative");
    expect(DEMO_VISUAL_LINKS["demo-trail-hardtail-alloy-frame"]).toMatchObject({ kind: "asset", matchesRecordedGeometry: false });
    expect(DEMO_VISUAL_LINKS["demo-rigid-mtb-fork-470"]).toMatchObject({ kind: "asset", key: "fork-mtb-rigid-demo", matchesRecordedGeometry: true });
    expect(DEMO_VISUAL_LINKS["demo-rigid-mtb-fork-480"]).toMatchObject({ kind: "asset", key: "fork-demo-mtb-480", matchesRecordedGeometry: true });
    const m = (key: string) => manifest.assets.find((a) => a.key === key)!.measured as Record<string, number>;
    expect(m("fork-mtb-rigid-demo").axle_to_crown_mm).toBeCloseTo(470, 0);
    expect(m("fork-demo-mtb-480").axle_to_crown_mm).toBeCloseTo(480, 0);
    // No recorded frame geometry chart → frame-derived measurements are estimates, never "recorded".
    expect(hardtail.derivedQuality.wheelbaseMm.quality).toBe("estimate");
  });

  it("generated parts use the recorded MTB dimensions", () => {
    expect(params(hardtail, "handlebar")).toMatchObject({ width_mm: 780, rise_mm: 20, backsweep_deg: 9, clamp_mm: 35, flat: 1 });
    expect(params(hardtail, "stem")).toMatchObject({ length_mm: 50, angle_deg: 0, steerer_clamp_mm: 28.6, bar_clamp_mm: 35 });
    expect(params(hardtail, "crankset")).toMatchObject({ crank_length_mm: 170, chainrings: [32] });
    expect((params(hardtail, "cassette").cogs as number[])[0]).toBe(51);
    expect(params(hardtail, "rotor_front").diameter_mm).toBe(180);
    expect(params(hardtail, "wheel_rear")).toMatchObject({ bsd_mm: 622, old_mm: 148, rim_depth_mm: 22 });
    expect(params(hardtail, "wheel_front").old_mm).toBe(110);
  });
});

describe("MTB replacements: geometry, dependants, compatibility and 2D stay in sync", () => {
  it("fork 470/44 → 480/51: front wheel moves forward, wheelbase grows, 2D fork line ends at the new axle", () => {
    const b = resolve(swap(MTB, { fork: "demo-rigid-mtb-fork-480" }));
    expect(node(b, "fork").status).toBe("ok");
    expect((node(b, "fork").source as { key: string }).key).toBe("fork-demo-mtb-480");
    expect(b.derived.wheelbaseMm!).toBeGreaterThan(hardtail.derived.wheelbaseMm!);
    expect(b.derived.pitchDeg).not.toBe(hardtail.derived.pitchDeg);
    // Dependants follow: front wheel sits on the new fork's axle, tire on the wheel, rotor on the hub.
    const axle = node(b, "fork").anchorsWorld.front_axle;
    expect(distance(node(b, "wheel_front").world!.t, axle)).toBeLessThan(TOLERANCE.attachPositionM);
    expect(distance(node(b, "tire_front").world!.t, axle)).toBeLessThan(TOLERANCE.attachPositionM);
    const fork2d = projectSide(b).find((p) => p.nodeId === "fork") as { points: [number, number][] };
    expect(fork2d.points[1][0]).toBeCloseTo(node(b, "wheel_front").world!.t[0], 9);
    expect(incompatible(swap(MTB, { fork: "demo-rigid-mtb-fork-480" }))).toEqual([]);
    expect(b.revision.fork).not.toEqual(hardtail.revision.fork);
  });

  it("fork without recorded geometry: no 3D model, dependants unavailable, nothing borrowed", () => {
    const b = resolve(swap(MTB, { fork: "demo-rigid-mtb-fork-unspecified" }));
    expect(node(b, "fork")).toMatchObject({ status: "no_visual", representation: "none", source: null });
    for (const id of ["wheel_front", "tire_front", "rotor_front"]) expect(node(b, id).status).toBe("host_unavailable");
    expect(b.derivedQuality.wheelbaseMm.quality).toBe("unavailable");
  });

  it("flat bar 780 → 760: narrower bar, still level; unrecorded rise/backsweep are listed, not invented", () => {
    const b = resolve(swap(MTB, { handlebar: "demo-carbon-flat-bar-760" }));
    expect(params(b, "handlebar")).toMatchObject({ width_mm: 760, rise_mm: 0, backsweep_deg: 0 });
    const src = node(b, "handlebar").source as { assumptions: string[] };
    expect(src.assumptions).toEqual(expect.arrayContaining(["Rise not recorded — 0 mm shown", "Backsweep not recorded — 0° shown"]));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...node(b, "handlebar").world!.r));
    expect(Math.abs(up.x)).toBeLessThan(1e-6);
    expect(node(b, "handlebar").warnings).toEqual([]);
  });

  it("riser bar without recorded width → needs verification, no geometry", () => {
    const b = resolve(swap(MTB, { handlebar: "demo-alloy-riser-bar-unspecified" }));
    expect(node(b, "handlebar")).toMatchObject({ status: "missing_dimensions", missing: ["width_mm"], representation: "none" });
  });

  it("stem 50/0° → 70/+6°: bar clamp at exactly 70 mm, further forward and higher; bar follows", () => {
    const b = resolve(swap(MTB, { stem: "demo-alloy-mtb-stem-70" }));
    const n = node(b, "stem");
    expect(distance(transformPoint(n.world!, [0, STEM_STACK_MM / 2000, 0]), n.anchorsWorld.bar_clamp)).toBeCloseTo(0.07, 9);
    expect(b.derived.barClampMm!.x).toBeGreaterThan(hardtail.derived.barClampMm!.x);
    expect(b.derived.barClampMm!.y).toBeGreaterThan(hardtail.derived.barClampMm!.y);
    expect(distance(node(b, "handlebar").world!.t, n.anchorsWorld.bar_clamp)).toBeLessThan(TOLERANCE.attachPositionM);
  });

  it("real interface mismatch: a 31.8 mm road stem with the 35 mm MTB bar is reported by both 3D and compatibility", () => {
    const c = swap(MTB, { stem: "demo-alloy-stem-100" });
    expect(node(resolve(c), "handlebar").warnings).toEqual(["interface_mismatch:bar_clamp: part 35 ≠ host 31.8"]);
    expect(incompatible(c)).toEqual(["bar-clamp"]);
  });

  it("crankset 170/32 → 175/30: pedal 5 mm lower, chain wraps the smaller ring", () => {
    const b = resolve(swap(MTB, { crankset: "demo-m12-crankset-175-30" }));
    expect(hardtail.derived.lowestPedalMm! - b.derived.lowestPedalMm!).toBeCloseTo(5, 6);
    expect(params(b, "chain").ring_r).toBeCloseTo(sprocketRadius(30) * 1000, 1);
    expect(params(hardtail, "chain").ring_r).toBeCloseTo(sprocketRadius(32) * 1000, 1);
  });

  it("cassette 10–51 Micro Spline → 10–52 XD: new cog stack, chain still on the 10T cog, compatible freehub", () => {
    const c = swap(MTB, { cassette: "demo-x12-cassette-10-52-xd" });
    const b = resolve(c);
    expect((params(b, "cassette").cogs as number[])[0]).toBe(52);
    expect(node(b, "cassette").status).toBe("ok");
    expect(params(b, "chain").cog_r).toBeCloseTo(sprocketRadius(10) * 1000, 1);
    expect(incompatible(c)).toEqual([]);
    // A road HG cassette does not fit this wheelset's freehub bodies.
    expect(incompatible(swap(MTB, { cassette: "demo-r12-cassette-11-34" }))).toEqual(["freehub"]);
  });

  it("chain replacement: geometry follows the drivetrain; an 11-speed chain is flagged against 12-speed parts", () => {
    const c = swap(MTB, { chain: "demo-r11-chain" });
    const b = resolve(c);
    expect(node(b, "chain").status).toBe("ok");
    expect(params(b, "chain").speeds).toBe(11);
    expect(incompatible(c)).toEqual(["speed-cassette-chain", "speed-crank-chain"]);
    // Removing the cassette leaves the chain without a host — never drawn floating.
    expect(node(resolve(swap(MTB, { cassette: null })), "chain").status).toBe("host_unavailable");
  });

  it("rotors: 203 mm fits the fork but exceeds the frame's 180 mm limit; Center Lock is flagged on 6-bolt hubs", () => {
    const front = resolve(swap(MTB, { front_rotor: "demo-rotor-203-6bolt" }));
    expect(params(front, "rotor_front").diameter_mm).toBe(203);
    expect(incompatible(swap(MTB, { front_rotor: "demo-rotor-203-6bolt" }))).toEqual([]);
    expect(incompatible(swap(MTB, { rear_rotor: "demo-rotor-203-6bolt#rear" }))).toEqual(["rear-rotor-size"]);
    expect(incompatible(swap(MTB, { front_rotor: "demo-rotor-160-centerlock" }))).toEqual(["rotor-mount"]);
    // Geometry is still shown for a flagged part (the 3D view does not hide incompatibilities).
    expect(node(resolve(swap(MTB, { rear_rotor: "demo-rotor-203-6bolt#rear" })), "rotor_rear").status).toBe("ok");
  });

  it("every replacement changes the fingerprint and the revision ref of exactly the replaced slots", () => {
    const swaps: [BikeSlot, string, string[]][] = [
      // The longer fork re-pitches the frame, so the chain's world-space path (derived) changes too.
      ["fork", "demo-rigid-mtb-fork-480", ["chain", "fork"]],
      ["handlebar", "demo-carbon-flat-bar-760", ["handlebar"]],
      ["stem", "demo-alloy-mtb-stem-70", ["stem"]],
      ["crankset", "demo-m12-crankset-175-30", ["crankset", "chain"]],
      ["cassette", "demo-x12-cassette-10-52-xd", ["cassette"]],
      ["chain", "demo-r11-chain", ["chain"]],
      ["front_rotor", "demo-rotor-203-6bolt", ["front_rotor"]],
    ];
    for (const [slot, part, changed] of swaps) {
      const b = resolve(swap(MTB, { [slot]: part }));
      expect(b.fingerprint, slot).not.toBe(hardtail.fingerprint);
      const diff = (Object.keys(b.revision) as BikeSlot[]).filter((k) => JSON.stringify(b.revision[k]) !== JSON.stringify(hardtail.revision[k])).sort();
      expect(diff, slot).toEqual([...changed].sort());
    }
  });

  it("road build is unchanged by the MTB expansion", () => {
    expect(road.nodes.map((n) => [n.id, n.status, n.representation])).toEqual(resolve(LAB_PRESETS.road).nodes.map((n) => [n.id, n.status, n.representation]));
    expect(node(road, "fork").source).toMatchObject({ key: "fork-demo-carbon-disc" });
    expect(incompatible(LAB_PRESETS.road)).toEqual([]);
  });
});
