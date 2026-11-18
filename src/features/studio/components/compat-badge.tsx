import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CompatibilityReport, CompatibilityStatus } from "@/lib/compatibility";

export const COMPAT_LABEL: Record<CompatibilityStatus, string> = {
  compatible: "Compatible",
  incompatible: "Incompatible",
  unknown: "Requires verification",
};

export function CompatBadge({ status }: { status: CompatibilityStatus }) {
  return status === "compatible" ? (
    <Badge tone="success"><CheckCircle2 /> {COMPAT_LABEL.compatible}</Badge>
  ) : status === "incompatible" ? (
    <Badge tone="danger"><XCircle /> {COMPAT_LABEL.incompatible}</Badge>
  ) : (
    <Badge tone="warning"><CircleHelp /> {COMPAT_LABEL.unknown}</Badge>
  );
}

export function CompatDetails({ report }: { report: CompatibilityReport }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <CompatBadge status={report.status} />
        <span className="text-xs text-muted-foreground">{report.summary}</span>
      </div>
      {report.checks.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-xs">
          {report.checks.map((c, i) => (
            <li key={`${c.ruleId}-${i}`} className="flex items-start gap-2 py-1.5">
              {c.status === "compatible" ? (
                <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" />
              ) : c.status === "incompatible" ? (
                <XCircle className="mt-px size-3.5 shrink-0 text-danger" />
              ) : (
                <CircleHelp className="mt-px size-3.5 shrink-0 text-warning" />
              )}
              <div className="min-w-0">
                <p className="font-medium">
                  {c.label} <span className="font-normal text-subtle-foreground">vs {c.against.name}</span>
                </p>
                <p className="break-words text-muted-foreground">{c.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
