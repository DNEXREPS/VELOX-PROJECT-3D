import { BadgeCheck, Calculator, FlaskConical, PenLine, Sigma, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/domain/bicycle";

export type ProvenanceKind = VerificationStatus | "user" | "calculated" | "estimated" | "custom";

const META: Record<ProvenanceKind, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "info"; icon: React.ReactNode; title: string }> = {
  manufacturer_verified: { label: "Verified", tone: "success", icon: <BadgeCheck />, title: "Checked against a cited manufacturer source" },
  community_verified: { label: "Community verified", tone: "info", icon: <Users />, title: "Reviewed by a VELOX moderator" },
  user_submitted: { label: "Unverified", tone: "neutral", icon: <PenLine />, title: "Submitted by a rider — not verified" },
  demo: { label: "Demo data", tone: "warning", icon: <FlaskConical />, title: "Fictional sample data — not a manufacturer specification" },
  user: { label: "User-entered", tone: "neutral", icon: <PenLine />, title: "Entered by the bicycle owner" },
  calculated: { label: "Calculated", tone: "info", icon: <Calculator />, title: "Calculated from the available data" },
  estimated: { label: "Estimated", tone: "warning", icon: <Sigma />, title: "Estimate based on assumptions (see notes)" },
  custom: { label: "Custom part", tone: "neutral", icon: <PenLine />, title: "Free-text part, not linked to the registry" },
};

export function ProvenanceBadge({ kind, className }: { kind: ProvenanceKind | null | undefined; className?: string }) {
  if (!kind) return null;
  const m = META[kind];
  return (
    <Badge tone={m.tone} title={m.title} className={className}>
      {m.icon}
      {m.label}
    </Badge>
  );
}
