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
    const a = resolve(swap(LAB_PRESETS.hardtail, { crankset: "lab-crank-170-32" }));
    const b = resolve(swap(LAB_PRESETS.hardtail, { crankset: "lab-crank-175-32" }));
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
    const s = resolve(swap(LAB_PRESETS.road, { fork: "demo-steel-gravel-fork" in LAB_PARTS ? "demo-steel-gravel-fork" : Object.keys(LAB_PARTS).find((k) => LAB_PARTS[k].slot === "fork" && !DEMO_VISUAL_LINKS[k] && !LAB_PARTS[k].binding)! }));
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
    const b = resolve(swap(LAB_PRESETS.hardtail, { crankset: "lab-crank-175-32" }));
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
