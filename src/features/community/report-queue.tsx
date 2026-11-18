"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moderateContent, resolveReport } from "@/server/actions/moderation";
import type { ReportTarget } from "@/lib/domain/bicycle";

export function ReportActions({ reportId, targetType, targetId }: { reportId: string; targetType: ReportTarget; targetId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Failed"));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-1">
      {targetType !== "profile" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => {
          const m = await moderateContent({ targetType, targetId, status: "hidden" });
          if (!m.ok) return m;
          return resolveReport({ reportId, status: "resolved", note: `${targetType} hidden` });
        })}>
          <EyeOff /> {targetType === "bicycle" ? "Make private & resolve" : "Hide & resolve"}
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resolveReport({ reportId, status: "resolved" }))}><Check /> Resolve</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resolveReport({ reportId, status: "dismissed" }))}><X /> Dismiss</Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
