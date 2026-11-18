"use client";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
  optional,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1 font-normal text-subtle-foreground">(optional)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 border px-3 py-2 text-sm",
        kind === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-success/35 bg-success/10 text-success",
      )}
    >
      {kind === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

export function FieldGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-border pt-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <legend className="sr-only">{title}</legend>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
