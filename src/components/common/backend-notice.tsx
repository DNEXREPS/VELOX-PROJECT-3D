import { DatabaseZap } from "lucide-react";

/** Shown instead of data when Supabase environment variables are missing. */
export function BackendNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div role="status" className="flex items-start gap-3 border border-warning/30 bg-warning/5 p-4 text-sm">
      <DatabaseZap className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">Backend not configured</p>
        {!compact && (
          <p className="text-muted-foreground">
            Set <code className="figure text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="figure text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see <code className="figure text-xs">.env.example</code>) and apply the migrations in{" "}
            <code className="figure text-xs">supabase/migrations</code>. No placeholder data is shown in the meantime.
          </p>
        )}
      </div>
    </div>
  );
}
