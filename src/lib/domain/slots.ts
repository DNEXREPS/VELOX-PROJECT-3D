/**
 * Bicycle slots — positions a component can occupy.
 * MUST mirror the `public.bike_slot` enum in supabase/migrations/20261118000100_foundation.sql.
 * (A unit test asserts both lists are identical.)
 */
export const BIKE_SLOTS = [
  "frame", "fork", "headset", "stem", "handlebar", "bar_tape", "shifters",
  "front_brake", "rear_brake", "front_rotor", "rear_rotor",
  "wheelset", "front_tire", "rear_tire", "tubes",
  "crankset", "bottom_bracket", "chain", "cassette",
  "front_derailleur", "rear_derailleur", "saddle", "seatpost", "pedals",
  "groupset", "accessory_1", "accessory_2", "accessory_3",
] as const;

export type BikeSlot = (typeof BIKE_SLOTS)[number];

export type SlotGroup = "frameset" | "cockpit" | "drivetrain" | "brakes" | "wheels" | "contact" | "other";

export const SLOT_META: Record<BikeSlot, { label: string; short: string; group: SlotGroup }> = {
  frame: { label: "Frame", short: "Frame", group: "frameset" },
  fork: { label: "Fork", short: "Fork", group: "frameset" },
  headset: { label: "Headset", short: "Headset", group: "frameset" },
  stem: { label: "Stem", short: "Stem", group: "cockpit" },
  handlebar: { label: "Handlebar", short: "Bar", group: "cockpit" },
  bar_tape: { label: "Bar tape / grips", short: "Tape", group: "cockpit" },
  shifters: { label: "Shifters / levers", short: "Shifters", group: "cockpit" },
  front_brake: { label: "Front brake", short: "F brake", group: "brakes" },
  rear_brake: { label: "Rear brake", short: "R brake", group: "brakes" },
  front_rotor: { label: "Front rotor", short: "F rotor", group: "brakes" },
  rear_rotor: { label: "Rear rotor", short: "R rotor", group: "brakes" },
  wheelset: { label: "Wheelset", short: "Wheels", group: "wheels" },
  front_tire: { label: "Front tire", short: "F tire", group: "wheels" },
  rear_tire: { label: "Rear tire", short: "R tire", group: "wheels" },
  tubes: { label: "Tubes / sealant", short: "Tubes", group: "wheels" },
  crankset: { label: "Crankset", short: "Cranks", group: "drivetrain" },
  bottom_bracket: { label: "Bottom bracket", short: "BB", group: "drivetrain" },
  chain: { label: "Chain", short: "Chain", group: "drivetrain" },
  cassette: { label: "Cassette", short: "Cassette", group: "drivetrain" },
  front_derailleur: { label: "Front derailleur", short: "FD", group: "drivetrain" },
  rear_derailleur: { label: "Rear derailleur", short: "RD", group: "drivetrain" },
  saddle: { label: "Saddle", short: "Saddle", group: "contact" },
  seatpost: { label: "Seatpost", short: "Post", group: "contact" },
  pedals: { label: "Pedals", short: "Pedals", group: "contact" },
  groupset: { label: "Groupset (reference)", short: "Groupset", group: "other" },
  accessory_1: { label: "Accessory 1", short: "Acc 1", group: "other" },
  accessory_2: { label: "Accessory 2", short: "Acc 2", group: "other" },
  accessory_3: { label: "Accessory 3", short: "Acc 3", group: "other" },
};

export const SLOT_GROUPS: { id: SlotGroup; label: string }[] = [
  { id: "frameset", label: "Frameset" },
  { id: "cockpit", label: "Cockpit" },
  { id: "drivetrain", label: "Drivetrain" },
  { id: "brakes", label: "Brakes" },
  { id: "wheels", label: "Wheels" },
  { id: "contact", label: "Contact points" },
  { id: "other", label: "Other" },
];

export function isBikeSlot(value: unknown): value is BikeSlot {
  return typeof value === "string" && (BIKE_SLOTS as readonly string[]).includes(value);
}

export function slotLabel(slot: string): string {
  return isBikeSlot(slot) ? SLOT_META[slot].label : slot;
}
