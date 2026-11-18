/**
 * Compatibility attribute registry.
 *
 * Each component may declare structured "interface" attributes (stored in
 * public.component_compatibility_rules). This registry defines how each
 * attribute's value is interpreted. Values are standards identifiers (e.g.
 * "bsa_68", "12x142_ta"), numbers (mm, speeds), or lists of identifiers.
 */
export type AttributeKind = "text" | "number" | "list";

export interface AttributeDef {
  key: string;
  label: string;
  kind: AttributeKind;
  unit?: string;
  /** Known identifiers with human labels (text/list kinds). Unknown identifiers are still accepted. */
  values?: Record<string, string>;
}

const BB_SHELLS = {
  bsa_68: "BSA threaded 68 mm",
  t47_86: "T47 threaded 86 mm (internal)",
  pf86: "Press-fit 86.5 mm",
  bb386: "BB386 EVO",
  bb30: "BB30",
};

const AXLES = {
  "12x100_ta": "12×100 mm thru-axle",
  "12x142_ta": "12×142 mm thru-axle",
  "12x148_ta": "12×148 mm Boost thru-axle",
  "100_qr": "100 mm quick-release",
  "130_qr": "130 mm quick-release",
  "135_qr": "135 mm quick-release",
};

const FREEHUBS = {
  shimano_hg: "Shimano HG",
  sram_xdr: "SRAM XDR",
  sram_xd: "SRAM XD",
  shimano_microspline: "Shimano Micro Spline",
  campagnolo_n3w: "Campagnolo N3W",
};

const BRAKE_MOUNTS = {
  flat_mount: "Flat mount",
  post_mount: "Post mount",
  rim_caliper: "Rim caliper (centre bolt)",
};

export const ATTRIBUTES: Record<string, AttributeDef> = {
  bb_shell: { key: "bb_shell", label: "Bottom bracket shell", kind: "text", values: BB_SHELLS },
  bb_shells: { key: "bb_shells", label: "Compatible BB shells", kind: "list", values: BB_SHELLS },
  rear_axle: { key: "rear_axle", label: "Rear axle standard", kind: "text", values: AXLES },
  front_axle: { key: "front_axle", label: "Front axle standard", kind: "text", values: AXLES },
  freehub_body: { key: "freehub_body", label: "Freehub body", kind: "text", values: FREEHUBS },
  freehub_bodies: { key: "freehub_bodies", label: "Available freehub bodies", kind: "list", values: FREEHUBS },
  brake_type: { key: "brake_type", label: "Brake type", kind: "text", values: { disc: "Disc", rim: "Rim" } },
  rear_brake_mount: { key: "rear_brake_mount", label: "Rear brake mount", kind: "text", values: BRAKE_MOUNTS },
  front_brake_mount: { key: "front_brake_mount", label: "Front brake mount", kind: "text", values: BRAKE_MOUNTS },
  brake_mount: { key: "brake_mount", label: "Brake mount", kind: "text", values: BRAKE_MOUNTS },
  max_rotor_mm: { key: "max_rotor_mm", label: "Max rotor size", kind: "number", unit: "mm" },
  rotor_diameter_mm: { key: "rotor_diameter_mm", label: "Rotor diameter", kind: "number", unit: "mm" },
  rotor_mount: {
    key: "rotor_mount",
    label: "Rotor mount",
    kind: "text",
    values: { centerlock: "Center Lock", six_bolt: "6-bolt" },
  },
  speeds: { key: "speeds", label: "Drivetrain speed", kind: "number", unit: "speed" },
  max_cog: { key: "max_cog", label: "Max cog capacity", kind: "number", unit: "T" },
  largest_cog: { key: "largest_cog", label: "Largest cog", kind: "number", unit: "T" },
  max_tire_width_mm: { key: "max_tire_width_mm", label: "Tire clearance", kind: "number", unit: "mm" },
  tire_width_mm: { key: "tire_width_mm", label: "Tire width", kind: "number", unit: "mm" },
  wheel_size: {
    key: "wheel_size",
    label: "Wheel size",
    kind: "text",
    values: { "700c": "700c / 29\" (ISO 622)", "650b": "650b / 27.5\" (ISO 584)", "26in": "26\" (ISO 559)" },
  },
  wheel_sizes: {
    key: "wheel_sizes",
    label: "Supported wheel sizes",
    kind: "list",
    values: { "700c": "700c (ISO 622)", "650b": "650b (ISO 584)", "26in": "26\" (ISO 559)" },
  },
  seatpost_diameter_mm: { key: "seatpost_diameter_mm", label: "Seatpost diameter", kind: "number", unit: "mm" },
  steerer_type: {
    key: "steerer_type",
    label: "Steerer / headset standard",
    kind: "text",
    values: { tapered: "Tapered 1-1/8\"–1-1/2\"", straight: "Straight 1-1/8\"" },
  },
  steerer_diameter_mm: { key: "steerer_diameter_mm", label: "Steerer clamp diameter", kind: "number", unit: "mm" },
  steerer_clamp_mm: { key: "steerer_clamp_mm", label: "Stem steerer clamp", kind: "number", unit: "mm" },
  handlebar_clamp_mm: { key: "handlebar_clamp_mm", label: "Stem handlebar clamp", kind: "number", unit: "mm" },
  clamp_mm: { key: "clamp_mm", label: "Handlebar clamp diameter", kind: "number", unit: "mm" },
  front_derailleur_mount: {
    key: "front_derailleur_mount",
    label: "Front derailleur mount",
    kind: "text",
    values: { braze_on: "Braze-on", clamp_31_8: "Clamp 31.8 mm", clamp_34_9: "Clamp 34.9 mm", none: "No mount (1×)" },
  },
  fd_mount: {
    key: "fd_mount",
    label: "Front derailleur mount type",
    kind: "text",
    values: { braze_on: "Braze-on", clamp_31_8: "Clamp 31.8 mm", clamp_34_9: "Clamp 34.9 mm" },
  },
};

export type AttributeValue = string | number | string[];

/** Component interfaces in the shape the engine consumes. */
export type AttributeMap = Record<string, AttributeValue | undefined>;

export function describeValue(attribute: string, value: AttributeValue | undefined): string {
  if (value === undefined) return "not specified";
  const def = ATTRIBUTES[attribute];
  if (Array.isArray(value)) return value.map((v) => def?.values?.[v] ?? v).join(", ");
  if (typeof value === "number") return def?.unit ? `${value} ${def.unit}` : String(value);
  return def?.values?.[value] ?? value;
}

/** Converts DB rows (component_compatibility_rules) into an AttributeMap. */
export function attributesFromRows(
  rows: { attribute: string; value_text: string | null; value_list: string[] | null; value_numeric: number | string | null }[],
): AttributeMap {
  const map: AttributeMap = {};
  for (const row of rows) {
    if (row.value_list && row.value_list.length > 0) map[row.attribute] = row.value_list;
    else if (row.value_numeric !== null && row.value_numeric !== undefined) map[row.attribute] = Number(row.value_numeric);
    else if (row.value_text !== null) map[row.attribute] = row.value_text;
  }
  return map;
}
