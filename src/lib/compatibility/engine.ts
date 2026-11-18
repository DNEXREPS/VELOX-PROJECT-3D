import type { BikeSlot } from "@/lib/domain/slots";
import { SLOT_META } from "@/lib/domain/slots";
import { ATTRIBUTES, describeValue, type AttributeMap, type AttributeValue } from "./attributes";
import { RULES, type CompatibilityRule, type Relation } from "./rules";

export type CompatibilityStatus = "compatible" | "incompatible" | "unknown";

export interface PartRef {
  slot: BikeSlot;
  name: string;
  attributes: AttributeMap;
}

export interface CheckResult {
  ruleId: string;
  label: string;
  status: CompatibilityStatus;
  message: string;
  against: { slot: BikeSlot; name: string };
}

export interface CompatibilityReport {
  status: CompatibilityStatus;
  checks: CheckResult[];
  /** Summary sentence suitable for UI. */
  summary: string;
}

function compare(relation: Relation, a: AttributeValue, b: AttributeValue): boolean | null {
  switch (relation) {
    case "equal":
      if (Array.isArray(a) || Array.isArray(b)) return null;
      return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : String(a) === String(b);
    case "a_in_b":
      if (!Array.isArray(b) || Array.isArray(a)) return null;
      return b.map(String).includes(String(a));
    case "b_in_a":
      if (!Array.isArray(a) || Array.isArray(b)) return null;
      return a.map(String).includes(String(b));
    case "a_lte_b":
      if (typeof a !== "number" || typeof b !== "number") return null;
      return a <= b;
  }
}

function relationWord(relation: Relation): string {
  return relation === "a_lte_b" ? "≤" : relation === "equal" ? "=" : "∈";
}

/**
 * Evaluate one rule between a candidate part and an installed counterpart.
 * Returns null when the rule does not apply to this pair of slots.
 */
export function evaluateRule(rule: CompatibilityRule, candidate: PartRef, other: PartRef): CheckResult | null {
  let aPart: PartRef;
  let bPart: PartRef;
  if (rule.a.slots.includes(candidate.slot) && rule.b.slots.includes(other.slot)) {
    aPart = candidate;
    bPart = other;
  } else if (rule.b.slots.includes(candidate.slot) && rule.a.slots.includes(other.slot)) {
    aPart = other;
    bPart = candidate;
  } else {
    return null;
  }
  if (aPart.slot === bPart.slot) return null;

  const aVal = aPart.attributes[rule.a.attribute];
  const bVal = bPart.attributes[rule.b.attribute];
  const against = { slot: other.slot, name: other.name };
  const aLabel = ATTRIBUTES[rule.a.attribute]?.label ?? rule.a.attribute;
  const bLabel = ATTRIBUTES[rule.b.attribute]?.label ?? rule.b.attribute;

  if (aVal === undefined || bVal === undefined) {
    const missing = aVal === undefined ? `${aPart.name} (${aLabel})` : `${bPart.name} (${bLabel})`;
    return {
      ruleId: rule.id,
      label: rule.label,
      status: "unknown",
      message: `Requires verification — ${missing} is not specified.`,
      against,
    };
  }

  const result = compare(rule.relation, aVal, bVal);
  if (result === null) {
    return {
      ruleId: rule.id,
      label: rule.label,
      status: "unknown",
      message: "Requires verification — attribute data has an unexpected format.",
      against,
    };
  }

  const detail = `${describeValue(rule.a.attribute, aVal)} ${relationWord(rule.relation)} ${describeValue(rule.b.attribute, bVal)}`;
  return result
    ? { ruleId: rule.id, label: rule.label, status: "compatible", message: detail, against }
    : {
        ruleId: rule.id,
        label: rule.label,
        status: "incompatible",
        message: `${detail} — ${rule.explanation}`,
        against,
      };
}

/**
 * Check a candidate part for `slot` against the parts currently installed on the bike.
 *
 * Rules:
 *  - any failing rule  → incompatible
 *  - any rule lacking data, or NO applicable rule at all → unknown (requires verification)
 *  - otherwise → compatible
 *
 * Matching categories alone never yields "compatible".
 */
export function checkCompatibility(
  candidate: PartRef,
  installed: PartRef[],
  rules: CompatibilityRule[] = RULES,
): CompatibilityReport {
  const checks: CheckResult[] = [];
  for (const other of installed) {
    if (other.slot === candidate.slot) continue;
    for (const rule of rules) {
      const res = evaluateRule(rule, candidate, other);
      if (res) checks.push(res);
    }
  }

  const status: CompatibilityStatus = checks.some((c) => c.status === "incompatible")
    ? "incompatible"
    : checks.length === 0 || checks.some((c) => c.status === "unknown")
      ? "unknown"
      : "compatible";

  const slotLabel = SLOT_META[candidate.slot]?.label ?? candidate.slot;
  const summary =
    status === "incompatible"
      ? `${checks.filter((c) => c.status === "incompatible").length} incompatibility found for ${slotLabel.toLowerCase()}.`
      : status === "compatible"
        ? `All ${checks.length} applicable checks passed.`
        : checks.length === 0
          ? "No verifiable compatibility data for this combination — requires verification."
          : `${checks.filter((c) => c.status === "unknown").length} check(s) lack data — requires verification.`;

  return { status, checks, summary };
}

/** Evaluate the whole configuration: every installed part against every other. */
export function checkConfiguration(parts: PartRef[], rules: CompatibilityRule[] = RULES): CheckResult[] {
  const results: CheckResult[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const other of parts) {
      if (part.slot === other.slot) continue;
      for (const rule of rules) {
        if (!rule.a.slots.includes(part.slot) || !rule.b.slots.includes(other.slot)) continue;
        const key = `${rule.id}:${part.slot}:${other.slot}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const res = evaluateRule(rule, part, other);
        if (res) results.push({ ...res, label: `${res.label} (${SLOT_META[part.slot].short} ↔ ${SLOT_META[other.slot].short})` });
      }
    }
  }
  return results;
}
