import Link from "next/link";
import { Bike, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL, type BicycleCategory } from "@/lib/domain/bicycle";
import { cn } from "@/lib/utils";

export interface BikeCardData {
  href: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: BicycleCategory | string | null;
  coverUrl: string | null;
  colorHex?: string | null;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  isPrimary?: boolean;
}

/** Bicycle tile used in the garage, explore and profiles. Cover image or a neutral colour plate — never a fake photo. */
export function BikeCard({ data, className }: { data: BikeCardData; className?: string }) {
  return (
    <Link href={data.href} className={cn("group flex flex-col border border-border bg-surface transition-colors hover:border-border-strong", className)}>
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {data.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URLs
          <img src={data.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="hairline-grid grid size-full place-items-center">
            <Bike className="size-10 text-border-strong" style={data.colorHex ? { color: data.colorHex } : undefined} strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {data.isPrimary && (
            <Badge tone="accent">
              <Star /> Primary
            </Badge>
          )}
          {data.badges}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium">{data.name}</h3>
          {data.category && <span className="eyebrow shrink-0">{CATEGORY_LABEL[data.category as BicycleCategory] ?? data.category}</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{[data.brand, data.model].filter(Boolean).join(" ") || "Brand / model not recorded"}</p>
        {data.meta && <div className="mt-auto pt-2 text-xs text-muted-foreground">{data.meta}</div>}
      </div>
    </Link>
  );
}
