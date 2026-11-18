import type { Metadata } from "next";
import { Compass, Search } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { BackendNotice } from "@/components/common/backend-notice";
import { Pagination } from "@/components/common/pagination";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BikeCard } from "@/features/garage/bike-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { explorePublicBikes, listPublicBrands } from "@/server/queries/community";
import { exploreQuerySchema, firstParams } from "@/lib/validation/schemas";
import { BICYCLE_CATEGORIES, CATEGORY_LABEL } from "@/lib/domain/bicycle";
import { formatKg } from "@/lib/format";

export const metadata: Metadata = { title: "Explore builds", description: "Public Digital Bike Passports from the VELOX community." };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = exploreQuerySchema.parse(firstParams(await searchParams));
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const [result, brands] = await Promise.all([explorePublicBikes(supabase, query), listPublicBrands(supabase)]);

  return (
    <Container wide>
      <PageHeader eyebrow="Community" title="Explore builds" description="Public bicycles and their Digital Bike Passports." />
      <form className="grid grid-cols-2 gap-2 border-b border-border py-4 sm:flex sm:items-center" action="/explore">
        <div className="relative col-span-2 sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input name="q" defaultValue={query.q} placeholder="Search bicycle, brand or rider" className="pl-9" aria-label="Search" />
        </div>
        <NativeSelect name="category" defaultValue={query.category ?? ""} aria-label="Category" className="sm:w-44">
          <option value="">All categories</option>
          {BICYCLE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </NativeSelect>
        <NativeSelect name="brand" defaultValue={query.brand ?? ""} aria-label="Brand" className="sm:w-40">
          <option value="">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={query.sort} aria-label="Sort" className="sm:w-36">
          <option value="recent">Most recent</option>
          <option value="popular">Most saved</option>
        </NativeSelect>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      <p className="py-3 text-xs text-muted-foreground"><span className="figure">{result.total}</span> public {result.total === 1 ? "build" : "builds"}</p>
      {result.items.length === 0 ? (
        <EmptyState icon={<Compass />} title="No public builds found" description={query.q || query.category || query.brand ? "Try different filters." : "When riders make a bicycle public, it appears here."} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {result.items.map((b) => (
            <BikeCard
              key={b.id}
              data={{
                href: `/bike/${b.owner_username}/${b.slug}`,
                name: b.name!,
                brand: b.brand,
                model: b.model,
                category: b.category,
                coverUrl: b.coverUrl,
                colorHex: b.color_hex,
                meta: (
                  <span className="flex justify-between gap-2">
                    <span>@{b.owner_username}</span>
                    <span className="figure">{b.component_count} parts{b.weight_kg ? ` · ${formatKg(b.weight_kg)}` : ""} · {b.bookmark_count} saves</span>
                  </span>
                ),
              }}
            />
          ))}
        </div>
      )}
      <Pagination page={query.page} pageCount={result.pageCount} basePath="/explore" params={{ q: query.q, category: query.category, brand: query.brand, sort: query.sort === "recent" ? undefined : query.sort }} />
    </Container>
  );
}
