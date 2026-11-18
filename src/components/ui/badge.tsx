import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] font-medium leading-4 whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-raised text-muted-foreground",
        accent: "border-accent/40 bg-accent-muted text-accent",
        success: "border-success/35 bg-success/10 text-success",
        warning: "border-warning/35 bg-warning/10 text-warning",
        danger: "border-danger/40 bg-danger/10 text-danger",
        info: "border-info/35 bg-info/10 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
