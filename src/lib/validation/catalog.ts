import { z } from "zod";
import { BIKE_SLOTS } from "../domain/slots";
import { VERIFICATION_STATUSES } from "../domain/bicycle";

/**
 * Schema for catalogue files (supabase/catalog/*.json).
 * Used by scripts/build-seed.ts (demo seed) and scripts/import-catalog.ts (real data).
 */
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase-kebab slug");

export const catalogCategorySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().min(1),
  description: z.string().optional(),
  slots: z.array(z.enum(BIKE_SLOTS)),
});

export const catalogBrandSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  name: z.string().min(1).max(60),
  website_url: z.url().optional(),
  country: z.string().optional(),
  is_demo: z.boolean().default(false),
});

const specTuple = z.union([
  z.tuple([z.string().regex(/^[a-z0-9_]{1,48}$/), z.string().min(1), z.union([z.string().min(1), z.number()])]),
  z.tuple([z.string().regex(/^[a-z0-9_]{1,48}$/), z.string().min(1), z.union([z.string().min(1), z.number()]), z.string()]),
]);

export const catalogComponentSchema = z
  .object({
    slug,
    brand: z.string(),
    category: z.string(),
    name: z.string().min(1).max(120),
    model: z.string().max(80).optional(),
    description: z.string().max(4000).optional(),
    weight_g: z.number().positive().optional(),
    material: z.string().max(60).optional(),
    price_reference: z.number().nonnegative().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    manufacturer_ref: z.string().max(80).optional(),
    source_url: z.url().optional(),
    verification_status: z.enum(VERIFICATION_STATUSES).optional(),
    specs: z.array(specTuple).default([]),
    compatibility: z.record(z.string().regex(/^[a-z0-9_]{1,48}$/), z.union([z.string(), z.number(), z.array(z.string())])).default({}),
  })
  .refine((c) => c.price_reference === undefined || c.currency !== undefined, {
    message: "price_reference requires currency",
  })
  .refine((c) => c.verification_status !== "manufacturer_verified" || c.source_url !== undefined, {
    message: "manufacturer_verified entries must cite a source_url",
  });

export const catalogFileSchema = z.object({
  $comment: z.string().optional(),
  brands: z.array(catalogBrandSchema).default([]),
  components: z.array(catalogComponentSchema),
});

export type CatalogFile = z.infer<typeof catalogFileSchema>;
export type CatalogComponent = z.infer<typeof catalogComponentSchema>;
