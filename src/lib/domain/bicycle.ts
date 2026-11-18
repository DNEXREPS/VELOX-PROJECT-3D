/** Mirrors enums in the foundation migration. */
export const BICYCLE_CATEGORIES = [
  "road", "gravel", "mountain", "cyclocross", "time_trial", "track",
  "touring", "city", "bmx", "ebike", "other",
] as const;
export type BicycleCategory = (typeof BICYCLE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<BicycleCategory, string> = {
  road: "Road",
  gravel: "Gravel",
  mountain: "Mountain",
  cyclocross: "Cyclocross",
  time_trial: "Time trial / Triathlon",
  track: "Track",
  touring: "Touring",
  city: "City / Commuter",
  bmx: "BMX",
  ebike: "E-bike",
  other: "Other",
};

export const FRAME_MATERIALS = ["carbon", "aluminium", "steel", "titanium", "other"] as const;
export type FrameMaterial = (typeof FRAME_MATERIALS)[number];
export const MATERIAL_LABEL: Record<FrameMaterial, string> = {
  carbon: "Carbon fibre",
  aluminium: "Aluminium",
  steel: "Steel",
  titanium: "Titanium",
  other: "Other",
};

export const VISIBILITIES = ["private", "public"] as const;
export type BicycleVisibility = (typeof VISIBILITIES)[number];

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD", "SEK", "NOK", "DKK"] as const;

export const MAINTENANCE_TYPES = [
  "inspection", "cleaning", "lubrication", "adjustment", "repair", "replacement",
  "installation", "brake_bleed", "tubeless_sealant", "wheel_true", "bearing_service",
  "suspension_service", "other",
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export const MAINTENANCE_TYPE_LABEL: Record<MaintenanceType, string> = {
  inspection: "Inspection",
  cleaning: "Cleaning",
  lubrication: "Lubrication",
  adjustment: "Adjustment",
  repair: "Repair",
  replacement: "Replacement",
  installation: "Installation",
  brake_bleed: "Brake bleed",
  tubeless_sealant: "Tubeless sealant",
  wheel_true: "Wheel truing",
  bearing_service: "Bearing service",
  suspension_service: "Suspension service",
  other: "Other",
};

export const VERIFICATION_STATUSES = ["demo", "user_submitted", "community_verified", "manufacturer_verified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const REPORT_REASONS = ["spam", "harassment", "inappropriate", "misleading", "stolen_property", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  misleading: "Misleading information",
  stolen_property: "Possibly stolen bicycle",
  other: "Other",
};
export const REPORT_TARGETS = ["post", "comment", "bicycle", "profile"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
