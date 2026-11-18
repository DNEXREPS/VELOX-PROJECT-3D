import { Badge } from "@/components/ui/badge";
import { BikeActions } from "@/features/garage/bike-actions";
import { BikeTabs } from "@/features/garage/bike-tabs";
import { VisibilityBadge } from "@/features/garage/garage-browser";
import { loadOwnedBike } from "@/server/bike-context";
import { CATEGORY_LABEL } from "@/lib/domain/bicycle";
import Link from "next/link";

export default async function BikeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { session, bike } = await loadOwnedBike(bikeId);
  await session.supabase.rpc("touch_bicycle", { p_bicycle_id: bike.id });
  const passportHref = bike.visibility === "public" ? `/bike/${session.profile.username}/${bike.slug}` : null;

  return (
    <div>
      <div className="border-b border-border bg-surface/40">
        <div className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="eyebrow mb-1 flex items-center gap-2">
                <Link href="/garage" className="hover:text-foreground">Garage</Link>
                <span>/</span>
                <span>{CATEGORY_LABEL[bike.category]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{bike.name}</h1>
                <VisibilityBadge v={bike.visibility} />
                {bike.is_primary && <Badge tone="accent">Primary</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[bike.brand, bike.model, bike.model_year].filter(Boolean).join(" · ") || "Brand and model not recorded"}
              </p>
            </div>
            <BikeActions bikeId={bike.id} name={bike.name} isPrimary={bike.is_primary} passportHref={passportHref} />
          </div>
          <div className="mt-4">
            <BikeTabs bikeId={bike.id} />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
