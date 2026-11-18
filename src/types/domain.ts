import type { BikeSlot } from "@/lib/domain/slots";
import type { AttributeMap } from "@/lib/compatibility/attributes";
import type { VerificationStatus } from "@/lib/domain/bicycle";
import type { Database } from "./database";

type T = Database["public"]["Tables"];
type V = Database["public"]["Views"];

export type BicycleRow = T["bicycles"]["Row"];
export type BicyclePrivateRow = T["bicycle_private_details"]["Row"];
export type PassportRow = V["bicycle_passports"]["Row"];
export type RevisionRow = T["bicycle_build_revisions"]["Row"];
export type MaintenanceRow = T["maintenance_records"]["Row"];
export type CatalogRow = V["component_catalog"]["Row"];
export type FeedRow = V["community_feed"]["Row"];

export type DataProvenance = "manufacturer" | "community" | "user" | "demo" | "calculated" | "estimated";

export interface SpecValue {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
  source: DataProvenance;
}

/** A part installed in a bicycle slot, normalised for UI + engine consumption. */
export interface InstalledPart {
  id: string;
  slot: BikeSlot;
  componentId: string | null;
  componentSlug: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  material: string | null;
  weightG: number | null;
  priceReference: number | null;
  currency: string | null;
  pricePaid: number | null;
  installedOn: string | null;
  notes: string | null;
  verification: VerificationStatus | null;
  custom: boolean;
  specs: SpecValue[];
  attributes: AttributeMap;
}

/** Snapshot entry stored in bicycle_build_revisions.{previous,new}_configuration. */
export interface SnapshotEntry {
  component_id?: string;
  name?: string;
  brand?: string;
  model?: string;
  category?: string;
  weight_g?: number;
  price_reference?: number;
  price_paid?: number;
  currency?: string;
  installed_on?: string;
  verification_status?: VerificationStatus;
  custom?: boolean;
}

export interface RevisionChange {
  slot: BikeSlot;
  action: "added" | "removed" | "replaced" | "updated";
  from?: SnapshotEntry;
  to?: SnapshotEntry;
}

/** Component as returned for selection lists (catalogue / studio picker). */
export interface CatalogComponent {
  id: string;
  slug: string;
  name: string;
  model: string | null;
  brandName: string;
  brandSlug: string;
  categorySlug: string;
  categoryName: string;
  slots: BikeSlot[];
  weightG: number | null;
  priceReference: number | null;
  currency: string | null;
  material: string | null;
  verification: VerificationStatus;
  specs: SpecValue[];
  attributes: AttributeMap;
}
