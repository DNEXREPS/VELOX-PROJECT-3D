import type { ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { BackendNotice } from "@/components/common/backend-notice";

export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid grid-cols-1 w-full max-w-[1100px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_400px] md:py-20">
      <div className="hidden flex-col justify-center gap-4 md:flex">
        <span className="eyebrow">VELOX Digital Garage</span>
        <p className="max-w-md text-2xl font-semibold leading-snug tracking-tight">
          Every bicycle has a digital identity. Every component has a record. Every modification has a history.
        </p>
      </div>
      <div className="flex flex-col gap-6 border border-border bg-surface p-6 sm:p-8">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {!isSupabaseConfigured() && <BackendNotice compact />}
        {children}
        {footer && <div className="border-t border-border pt-4 text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
