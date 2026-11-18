import type { BikeSlot } from "@/lib/domain/slots";

/**
 * Data-driven compatibility rules. Each rule relates an attribute on a component
 * in one set of slots ("a") to an attribute on a component in another ("b").
 *
 * Relations:
 *  - equal    a == b
 *  - a_in_b   value a is contained in list b
 *  - b_in_a   value b is contained in list a
 *  - a_lte_b  number a <= number b (e.g. tire width <= frame clearance)
 *
 * To add manufacturer-specific rules later, append to RULES or register a
 * custom evaluator via `customEvaluator`.
 */
export type Relation = "equal" | "a_in_b" | "b_in_a" | "a_lte_b";

export interface RuleSide {
  slots: BikeSlot[];
  attribute: string;
}

export interface CompatibilityRule {
  id: string;
  label: string;
  a: RuleSide;
  b: RuleSide;
  relation: Relation;
  /** Shown when the rule fails, e.g. why it matters. */
  explanation: string;
}

export const RULES: CompatibilityRule[] = [
  {
    id: "bb-shell",
    label: "Bottom bracket standard",
    a: { slots: ["frame"], attribute: "bb_shell" },
    b: { slots: ["crankset", "bottom_bracket"], attribute: "bb_shells" },
    relation: "a_in_b",
    explanation: "The crankset / bottom bracket must support the frame's BB shell standard.",
  },
  {
    id: "rear-axle",
    label: "Rear axle standard",
    a: { slots: ["wheelset"], attribute: "rear_axle" },
    b: { slots: ["frame"], attribute: "rear_axle" },
    relation: "equal",
    explanation: "Rear hub spacing and axle type must match the frame dropouts.",
  },
  {
    id: "front-axle",
    label: "Front axle standard",
    a: { slots: ["wheelset"], attribute: "front_axle" },
    b: { slots: ["fork"], attribute: "front_axle" },
    relation: "equal",
    explanation: "Front hub spacing and axle type must match the fork.",
  },
  {
    id: "freehub",
    label: "Freehub body",
    a: { slots: ["cassette"], attribute: "freehub_body" },
    b: { slots: ["wheelset"], attribute: "freehub_bodies" },
    relation: "a_in_b",
    explanation: "The cassette must fit a freehub body available for the rear hub.",
  },
  {
    id: "wheel-brake-type",
    label: "Wheel brake type",
    a: { slots: ["wheelset"], attribute: "brake_type" },
    b: { slots: ["frame", "fork"], attribute: "brake_type" },
    relation: "equal",
    explanation: "Disc-brake wheels need a disc frameset; rim-brake wheels need rim brakes.",
  },
  {
    id: "rear-brake-type",
    label: "Rear brake type",
    a: { slots: ["rear_brake"], attribute: "brake_type" },
    b: { slots: ["frame"], attribute: "brake_type" },
    relation: "equal",
    explanation: "Brake type must match the frame.",
  },
  {
    id: "front-brake-type",
    label: "Front brake type",
    a: { slots: ["front_brake"], attribute: "brake_type" },
    b: { slots: ["fork"], attribute: "brake_type" },
    relation: "equal",
    explanation: "Brake type must match the fork.",
  },
  {
    id: "lever-brake-type",
    label: "Lever / brake system",
    a: { slots: ["shifters"], attribute: "brake_type" },
    b: { slots: ["front_brake", "rear_brake"], attribute: "brake_type" },
    relation: "equal",
    explanation: "Levers must actuate the same brake system (disc vs rim).",
  },
  {
    id: "rear-brake-mount",
    label: "Rear brake mount",
    a: { slots: ["rear_brake"], attribute: "brake_mount" },
    b: { slots: ["frame"], attribute: "rear_brake_mount" },
    relation: "equal",
    explanation: "Caliper mount must match the frame's brake mount (adapters require verification).",
  },
  {
    id: "front-brake-mount",
    label: "Front brake mount",
    a: { slots: ["front_brake"], attribute: "brake_mount" },
    b: { slots: ["fork"], attribute: "front_brake_mount" },
    relation: "equal",
    explanation: "Caliper mount must match the fork's brake mount (adapters require verification).",
  },
  {
    id: "rear-rotor-size",
    label: "Rear rotor size",
    a: { slots: ["rear_rotor"], attribute: "rotor_diameter_mm" },
    b: { slots: ["frame"], attribute: "max_rotor_mm" },
    relation: "a_lte_b",
    explanation: "Rotor diameter must not exceed the frame's maximum.",
  },
  {
    id: "front-rotor-size",
    label: "Front rotor size",
    a: { slots: ["front_rotor"], attribute: "rotor_diameter_mm" },
    b: { slots: ["fork"], attribute: "max_rotor_mm" },
    relation: "a_lte_b",
    explanation: "Rotor diameter must not exceed the fork's maximum.",
  },
  {
    id: "rotor-mount",
    label: "Rotor mount",
    a: { slots: ["front_rotor", "rear_rotor"], attribute: "rotor_mount" },
    b: { slots: ["wheelset"], attribute: "rotor_mount" },
    relation: "equal",
    explanation: "Rotor interface must match the hub (Center Lock vs 6-bolt; adapters require verification).",
  },
  {
    id: "rear-tire-clearance",
    label: "Rear tire clearance",
    a: { slots: ["rear_tire"], attribute: "tire_width_mm" },
    b: { slots: ["frame"], attribute: "max_tire_width_mm" },
    relation: "a_lte_b",
    explanation: "Nominal tire width must fit within the frame's stated clearance.",
  },
  {
    id: "front-tire-clearance",
    label: "Front tire clearance",
    a: { slots: ["front_tire"], attribute: "tire_width_mm" },
    b: { slots: ["fork"], attribute: "max_tire_width_mm" },
    relation: "a_lte_b",
    explanation: "Nominal tire width must fit within the fork's stated clearance.",
  },
  {
    id: "tire-wheel-size",
    label: "Tire / rim diameter",
    a: { slots: ["front_tire", "rear_tire"], attribute: "wheel_size" },
    b: { slots: ["wheelset"], attribute: "wheel_size" },
    relation: "equal",
    explanation: "Tire bead seat diameter must match the rim.",
  },
  {
    id: "frame-wheel-size",
    label: "Frame wheel size",
    a: { slots: ["wheelset"], attribute: "wheel_size" },
    b: { slots: ["frame", "fork"], attribute: "wheel_sizes" },
    relation: "a_in_b",
    explanation: "The frameset must be designed for this wheel size.",
  },
  {
    id: "seatpost-diameter",
    label: "Seatpost diameter",
    a: { slots: ["seatpost"], attribute: "seatpost_diameter_mm" },
    b: { slots: ["frame"], attribute: "seatpost_diameter_mm" },
    relation: "equal",
    explanation: "Seatpost diameter must match the frame's seat tube (shims require verification).",
  },
  {
    id: "headset-standard",
    label: "Headset / steerer standard",
    a: { slots: ["fork", "headset"], attribute: "steerer_type" },
    b: { slots: ["frame"], attribute: "steerer_type" },
    relation: "equal",
    explanation: "Fork steerer and headset must match the frame's head tube standard.",
  },
  {
    id: "stem-steerer",
    label: "Stem steerer clamp",
    a: { slots: ["stem"], attribute: "steerer_clamp_mm" },
    b: { slots: ["fork"], attribute: "steerer_diameter_mm" },
    relation: "equal",
    explanation: "Stem clamp must match the fork steerer diameter.",
  },
  {
    id: "bar-clamp",
    label: "Handlebar clamp",
    a: { slots: ["handlebar"], attribute: "clamp_mm" },
    b: { slots: ["stem"], attribute: "handlebar_clamp_mm" },
    relation: "equal",
    explanation: "Handlebar clamp diameter must match the stem faceplate.",
  },
  {
    id: "speed-cassette-chain",
    label: "Cassette / chain speed",
    a: { slots: ["cassette"], attribute: "speeds" },
    b: { slots: ["chain"], attribute: "speeds" },
    relation: "equal",
    explanation: "Chain width must match the cassette's speed count.",
  },
  {
    id: "speed-cassette-rd",
    label: "Cassette / derailleur speed",
    a: { slots: ["cassette"], attribute: "speeds" },
    b: { slots: ["rear_derailleur"], attribute: "speeds" },
    relation: "equal",
    explanation: "Rear derailleur indexing must match the cassette's speed count.",
  },
  {
    id: "speed-shifter-rd",
    label: "Shifter / derailleur speed",
    a: { slots: ["shifters"], attribute: "speeds" },
    b: { slots: ["rear_derailleur", "front_derailleur"], attribute: "speeds" },
    relation: "equal",
    explanation: "Shifter indexing must match the derailleurs.",
  },
  {
    id: "speed-crank-chain",
    label: "Crankset / chain speed",
    a: { slots: ["crankset"], attribute: "speeds" },
    b: { slots: ["chain"], attribute: "speeds" },
    relation: "equal",
    explanation: "Chainring tooth profile is designed for a specific chain width.",
  },
  {
    id: "rd-capacity",
    label: "Derailleur cog capacity",
    a: { slots: ["cassette"], attribute: "largest_cog" },
    b: { slots: ["rear_derailleur"], attribute: "max_cog" },
    relation: "a_lte_b",
    explanation: "The largest cog must be within the rear derailleur's rated capacity.",
  },
  {
    id: "fd-mount",
    label: "Front derailleur mount",
    a: { slots: ["front_derailleur"], attribute: "fd_mount" },
    b: { slots: ["frame"], attribute: "front_derailleur_mount" },
    relation: "equal",
    explanation: "The derailleur mount must match the frame (braze-on vs clamp).",
  },
];
