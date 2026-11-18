import { describe, expect, it } from "vitest";
import { checkCompatibility, checkConfiguration, evaluateRule, RULES, type PartRef } from "@/lib/compatibility";
import { attributesFromRows, describeValue } from "@/lib/compatibility/attributes";

const frame: PartRef = {
  slot: "frame",
  name: "Endurance frame",
  attributes: { bb_shell: "bsa_68", rear_axle: "12x142_ta", brake_type: "disc", max_tire_width_mm: 32, wheel_sizes: ["700c"], seatpost_diameter_mm: 27.2, max_rotor_mm: 160, rear_brake_mount: "flat_mount", steerer_type: "tapered", front_derailleur_mount: "braze_on" },
};
const fork: PartRef = {
  slot: "fork",
  name: "Disc fork",
  attributes: { front_axle: "12x100_ta", brake_type: "disc", max_tire_width_mm: 32, steerer_diameter_mm: 28.6, steerer_type: "tapered", wheel_sizes: ["700c"] },
};
const wheels: PartRef = {
  slot: "wheelset",
  name: "Alloy disc wheels",
  attributes: { wheel_size: "700c", front_axle: "12x100_ta", rear_axle: "12x142_ta", brake_type: "disc", freehub_bodies: ["shimano_hg"], rotor_mount: "centerlock" },
};
const cassette12: PartRef = { slot: "cassette", name: "12s 11-34", attributes: { speeds: 12, freehub_body: "shimano_hg", largest_cog: 34 } };
const chain12: PartRef = { slot: "chain", name: "12s chain", attributes: { speeds: 12 } };
const rd12: PartRef = { slot: "rear_derailleur", name: "12s RD", attributes: { speeds: 12, max_cog: 34 } };

describe("compatibility engine", () => {
  it("marks a fully specified, matching candidate as compatible", () => {
    const report = checkCompatibility(cassette12, [frame, wheels, chain12, rd12]);
    expect(report.status).toBe("compatible");
    expect(report.checks.map((c) => c.ruleId).sort()).toEqual(["freehub", "rd-capacity", "speed-cassette-chain", "speed-cassette-rd"]);
  });

  it("detects a freehub mismatch as incompatible", () => {
    const xdr: PartRef = { slot: "cassette", name: "XDR 10-33", attributes: { speeds: 12, freehub_body: "sram_xdr", largest_cog: 33 } };
    const report = checkCompatibility(xdr, [wheels, chain12, rd12]);
    expect(report.status).toBe("incompatible");
    expect(report.checks.find((c) => c.ruleId === "freehub")?.status).toBe("incompatible");
  });

  it("detects a drivetrain speed mismatch", () => {
    const cassette11: PartRef = { slot: "cassette", name: "11s", attributes: { speeds: 11, freehub_body: "shimano_hg", largest_cog: 28 } };
    const report = checkCompatibility(cassette11, [chain12, wheels]);
    expect(report.status).toBe("incompatible");
    expect(report.checks.find((c) => c.ruleId === "speed-cassette-chain")?.status).toBe("incompatible");
  });

  it("treats tire clearance as a <= relation (boundary inclusive)", () => {
    const tire32: PartRef = { slot: "rear_tire", name: "32mm", attributes: { tire_width_mm: 32, wheel_size: "700c" } };
    const tire35: PartRef = { slot: "rear_tire", name: "35mm", attributes: { tire_width_mm: 35, wheel_size: "700c" } };
    expect(checkCompatibility(tire32, [frame, wheels]).status).toBe("compatible");
    const r = checkCompatibility(tire35, [frame, wheels]);
    expect(r.status).toBe("incompatible");
    expect(r.checks.find((c) => c.ruleId === "rear-tire-clearance")?.message).toContain("35 mm ≤ 32 mm");
  });

  it("returns unknown when a required attribute is missing on either side", () => {
    const anonymousCassette: PartRef = { slot: "cassette", name: "Unknown cassette", attributes: { speeds: 12 } };
    const report = checkCompatibility(anonymousCassette, [wheels, chain12]);
    expect(report.status).toBe("unknown");
    expect(report.checks.find((c) => c.ruleId === "freehub")?.message).toMatch(/Requires verification/);
  });

  it("never claims compatibility when no rule applies (category match alone is not enough)", () => {
    const saddle: PartRef = { slot: "saddle", name: "Saddle", attributes: {} };
    const report = checkCompatibility(saddle, [frame, fork, wheels]);
    expect(report.checks).toHaveLength(0);
    expect(report.status).toBe("unknown");
    expect(report.summary).toMatch(/requires verification/i);
  });

  it("incompatible wins over unknown", () => {
    const seatpost316: PartRef = { slot: "seatpost", name: "31.6 post", attributes: { seatpost_diameter_mm: 31.6 } };
    const report = checkCompatibility(seatpost316, [frame, { slot: "saddle", name: "s", attributes: {} }]);
    expect(report.status).toBe("incompatible");
  });

  it("evaluates rules symmetrically regardless of which side is the candidate", () => {
    const rule = RULES.find((r) => r.id === "rear-axle")!;
    const a = evaluateRule(rule, wheels, frame);
    const b = evaluateRule(rule, frame, wheels);
    expect(a?.status).toBe("compatible");
    expect(b?.status).toBe("compatible");
  });

  it("checks the BB shell against a list of supported shells", () => {
    const crank: PartRef = { slot: "crankset", name: "Crank", attributes: { speeds: 12, bb_shells: ["pf86"] } };
    const r = checkCompatibility(crank, [frame]);
    expect(r.checks.find((c) => c.ruleId === "bb-shell")?.status).toBe("incompatible");
  });

  it("checks whole configurations without duplicate pairs", () => {
    const results = checkConfiguration([frame, fork, wheels, cassette12, chain12, rd12]);
    const keys = results.map((r) => r.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(results.every((r) => r.status === "compatible")).toBe(true);
  });

  it("supports custom (manufacturer-specific) rule sets", () => {
    const custom = [{ id: "x", label: "Custom", a: { slots: ["saddle" as const], attribute: "rail" }, b: { slots: ["seatpost" as const], attribute: "rail" }, relation: "equal" as const, explanation: "rails" }];
    const r = checkCompatibility({ slot: "saddle", name: "s", attributes: { rail: "oval" } }, [{ slot: "seatpost", name: "p", attributes: { rail: "round" } }], custom);
    expect(r.status).toBe("incompatible");
  });
});

describe("attribute helpers", () => {
  it("converts DB rows to an attribute map with correct types", () => {
    const map = attributesFromRows([
      { attribute: "speeds", value_text: null, value_list: null, value_numeric: "12" },
      { attribute: "freehub_bodies", value_text: null, value_list: ["shimano_hg"], value_numeric: null },
      { attribute: "brake_type", value_text: "disc", value_list: null, value_numeric: null },
    ]);
    expect(map).toEqual({ speeds: 12, freehub_bodies: ["shimano_hg"], brake_type: "disc" });
  });

  it("describes values with labels and units", () => {
    expect(describeValue("rear_axle", "12x142_ta")).toBe("12×142 mm thru-axle");
    expect(describeValue("max_tire_width_mm", 32)).toBe("32 mm");
    expect(describeValue("speeds", undefined)).toBe("not specified");
  });
});
