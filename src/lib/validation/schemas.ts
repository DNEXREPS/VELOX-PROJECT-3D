import "./zod-config";
import { z } from "zod";
import {
  BICYCLE_CATEGORIES,
  FRAME_MATERIALS,
  MAINTENANCE_TYPES,
  REPORT_REASONS,
  REPORT_TARGETS,
  VISIBILITIES,
} from "@/lib/domain/bicycle";
import { BIKE_SLOTS } from "@/lib/domain/slots";

/* ---------- helpers: form inputs arrive as strings; "" means "not provided" ---------- */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
    (() => {
      let n = z.number({ error: "Must be a number" });
      if (opts.int) n = n.int("Must be a whole number");
      if (opts.min !== undefined) n = n.min(opts.min);
      if (opts.max !== undefined) n = n.max(opts.max);
      return n.optional();
    })(),
  );
const optionalDate = z.preprocess(
  emptyToUndefined,
  z.iso.date({ error: "Use YYYY-MM-DD" }).optional(),
);
const currency = z.string().regex(/^[A-Z]{3}$/, "3-letter currency code");
/** Normalise (trim + lowercase) BEFORE validating the email format. */
const emailField = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));
const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

/* ---------------------------------- auth ---------------------------------- */

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, "3–24 characters: lowercase letters, numbers, underscore");

export const passwordSchema = z
  .string()
  .min(10, "At least 10 characters")
  .max(72, "At most 72 characters")
  .regex(/[a-zA-Z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z
  .object({
    email: emailField,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

/* -------------------------------- profile -------------------------------- */

export const profileSchema = z.object({
  username: usernameSchema,
  display_name: optionalText(60),
  bio: optionalText(500),
  location: optionalText(80),
  website_url: z.preprocess(
    emptyToUndefined,
    z.url({ protocol: /^https?$/, error: "Must start with http(s)://" }).max(200).optional(),
  ),
});

/* -------------------------------- bicycle -------------------------------- */

export const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "bike";

export const bicycleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  brand: optionalText(60),
  model: optionalText(80),
  category: z.enum(BICYCLE_CATEGORIES),
  frame_material: z.preprocess(emptyToUndefined, z.enum(FRAME_MATERIALS).optional()),
  frame_size: optionalText(20),
  model_year: optionalNumber({ min: 1860, max: 2100, int: true }),
  color: optionalText(40),
  color_hex: z.preprocess(emptyToUndefined, z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour like #1a1a1a").optional()),
  weight_kg: optionalNumber({ min: 0.1, max: 99.99 }),
  estimated_value: optionalNumber({ min: 0, max: 9_999_999 }),
  value_currency: currency.default("EUR"),
  description: optionalText(4000),
  visibility: z.enum(VISIBILITIES).default("private"),
  is_primary: checkbox.default(false),
  // private details
  serial_number: optionalText(64),
  purchase_price: optionalNumber({ min: 0, max: 9_999_999 }),
  purchase_currency: currency.default("EUR"),
  purchase_date: optionalDate.refine((d) => !d || d <= new Date(Date.now() + 86400000).toISOString().slice(0, 10), {
    message: "Purchase date cannot be in the future",
  }),
});
export type BicycleInput = z.infer<typeof bicycleSchema>;

export const passportSettingsSchema = z.object({
  visibility: z.enum(VISIBILITIES),
  passport_show_weight: checkbox,
  passport_show_value: checkbox,
  passport_show_components: checkbox,
  passport_show_history: checkbox,
  passport_show_maintenance: checkbox,
});

/* ----------------------------- configuration ----------------------------- */

export const configurationChangeSchema = z
  .object({
    slot: z.enum(BIKE_SLOTS),
    component_id: z.uuid().nullable().optional(),
    custom_name: z.string().trim().max(120).nullable().optional(),
    price_paid: z.number().min(0).max(1_000_000).nullable().optional(),
    currency: currency.nullable().optional(),
    installed_on: z.iso.date().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    remove: z.boolean().optional(),
  })
  .refine((c) => c.remove || c.component_id || (c.custom_name && c.custom_name.length > 0), {
    message: "Choose a component or enter a custom part name",
  })
  .refine((c) => c.price_paid == null || c.currency, { message: "Currency is required with a price", path: ["currency"] });

export const applyConfigurationSchema = z.object({
  bicycleId: z.uuid(),
  description: z.string().trim().max(500).optional(),
  changes: z.array(configurationChangeSchema).min(1, "No changes to save").max(40),
});
export type ConfigurationChange = z.infer<typeof configurationChangeSchema>;

/* ------------------------------- components ------------------------------ */

export const componentSubmissionSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    brand_id: z.uuid("Choose a brand"),
    category_id: z.uuid("Choose a category"),
    model: optionalText(80),
    description: optionalText(4000),
    weight_g: optionalNumber({ min: 0.1, max: 100000 }),
    material: optionalText(60),
    price_reference: optionalNumber({ min: 0, max: 1_000_000 }),
    currency: z.preprocess(emptyToUndefined, currency.optional()),
    manufacturer_ref: optionalText(80),
    source_url: z.preprocess(emptyToUndefined, z.url({ protocol: /^https?$/ }).optional()),
  })
  .refine((d) => d.price_reference === undefined || d.currency !== undefined, {
    path: ["currency"],
    message: "Currency is required with a price",
  });

// Query-string schemas never throw: invalid values fall back to defaults.
export const componentQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()).catch(undefined),
  category: z.preprocess(emptyToUndefined, z.string().regex(/^[a-z0-9-]{2,40}$/).optional()).catch(undefined),
  brand: z.preprocess(emptyToUndefined, z.string().regex(/^[a-z0-9-]{2,60}$/).optional()).catch(undefined),
  slot: z.preprocess(emptyToUndefined, z.enum(BIKE_SLOTS).optional()).catch(undefined),
  sort: z.enum(["name", "weight_asc", "weight_desc", "price_asc", "price_desc", "newest"]).catch("name"),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});
export type ComponentQuery = z.infer<typeof componentQuerySchema>;

/* ------------------------------- maintenance ----------------------------- */

export const maintenanceSchema = z
  .object({
    maintenance_type: z.enum(MAINTENANCE_TYPES),
    title: z.string().trim().min(1, "Title is required").max(120),
    performed_on: z.iso.date({ error: "Date is required" }),
    slot: z.preprocess(emptyToUndefined, z.enum(BIKE_SLOTS).optional()),
    cost: optionalNumber({ min: 0, max: 1_000_000 }),
    currency: z.preprocess(emptyToUndefined, currency.optional()),
    distance_km: optionalNumber({ min: 0, max: 10_000_000 }),
    notes: optionalText(4000),
    next_due_on: optionalDate,
    next_due_distance_km: optionalNumber({ min: 0, max: 10_000_000 }),
  })
  .refine((d) => d.performed_on <= new Date(Date.now() + 86400000).toISOString().slice(0, 10), {
    path: ["performed_on"],
    message: "Cannot be in the future",
  })
  .refine((d) => d.cost === undefined || d.currency !== undefined, { path: ["currency"], message: "Currency is required with a cost" })
  .refine((d) => !d.next_due_on || d.next_due_on >= d.performed_on, {
    path: ["next_due_on"],
    message: "Must be on or after the service date",
  })
  .refine(
    (d) => d.next_due_distance_km === undefined || d.distance_km === undefined || d.next_due_distance_km >= d.distance_km,
    { path: ["next_due_distance_km"], message: "Must be greater than the current distance" },
  );
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

/* -------------------------------- community ------------------------------ */

export const postSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  body: z.string().trim().max(10000).default(""),
  bicycle_id: z.preprocess(emptyToUndefined, z.uuid().optional()),
});

export const commentSchema = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1, "Write something").max(2000),
});

export const reportSchema = z.object({
  target_type: z.enum(REPORT_TARGETS),
  target_id: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: optionalText(1000),
});

export const exploreQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()).catch(undefined),
  category: z.preprocess(emptyToUndefined, z.enum(BICYCLE_CATEGORIES).optional()).catch(undefined),
  brand: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()).catch(undefined),
  sort: z.enum(["recent", "popular"]).catch("recent"),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

/* ---------------------------------- uploads ------------------------------ */

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/** Next.js searchParams may contain arrays for repeated keys — keep the first value. */
export function firstParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
