import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { BackendNotice } from "@/components/common/backend-notice";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { ProvenanceBadge } from "@/components/common/provenance";
import { DataValue } from "@/components/common/data-value";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitComponentDialog } from "@/features/components/submit-component";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "@/server/auth";
import { listBrands, listCategories, searchComponents } from "@/server/queries/components";
import { componentQuerySchema, firstParams } from "@/lib/validation/schemas";
import { formatMoney, formatWeight } from "@/lib/format";
import type { VerificationStatus } from "@/lib/domain/bicycle";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Component registry", description: "Bicycle components with sourced specifications and compatibility data." };

export default async function ComponentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = firstParams(await searchParams);
  const query = componentQuerySchema.parse(raw);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const [result, categories, brands, session] = await Promise.all([searchComponents(supabase, query), listCategories(supabase), listBrands(supabase), getSession()]);
  const params = { q: query.q, category: query.category, brand: query.brand, sort: query.sort === "name" ? undefined : query.sort };
  const catHref = (slug?: string) => {
    const q = new URLSearchParams();
    if (slug) q.set("category", slug);
    if (query.q) q.set("q", query.q);
    if (query.brand) q.set("brand", query.brand);
    return `/components${q.size ? `?${q}` : ""}`;
  };

  return (
    <Container wide>
      <PageHeader
        eyebrow="Registry"
        title="Components"
        description="Parts with structured specifications and compatibility attributes. Every entry shows where its data comes from."
        actions={session ? <SubmitComponentDialog brands={brands} categories={categories} defaultOpen={raw.submit === "1"} /> : <Button asChild size="sm" variant="outline"><Link href="/login?next=/components">Sign in to submit</Link></Button>}
      />
      <div className="grid grid-cols-1 gap-6 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Categories" className="hidden lg:block">
          <ul className="flex flex-col">
            <li>
              <Link href={catHref()} className={cn("block border-l-2 px-3 py-1.5 text-sm", !query.category ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>All categories</Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={catHref(c.slug)} className={cn("block border-l-2 px-3 py-1.5 text-sm", query.category === c.slug ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <form action="/components" className="grid grid-cols-2 gap-2 pb-4 sm:flex sm:items-center">
            <div className="relative col-span-2 sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input name="q" defaultValue={query.q} placeholder="Search name, model or reference" className="pl-9" aria-label="Search components" />
            </div>
            <NativeSelect name="category" defaultValue={query.category ?? ""} aria-label="Category" className="lg:hidden">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </NativeSelect>
            <NativeSelect name="brand" defaultValue={query.brand ?? ""} aria-label="Brand" className="sm:w-44">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
            </NativeSelect>
            <NativeSelect name="sort" defaultValue={query.sort} aria-label="Sort" className="sm:w-40">
              <option value="name">Name A–Z</option>
              <option value="weight_asc">Lightest first</option>
              <option value="weight_desc">Heaviest first</option>
              <option value="price_asc">Price low–high</option>
              <option value="price_desc">Price high–low</option>
              <option value="newest">Newest</option>
            </NativeSelect>
            <Button type="submit" variant="secondary">Apply</Button>
          </form>
          <p className="pb-2 text-xs text-muted-foreground"><span className="figure">{result.total}</span> components</p>
          {result.items.length === 0 ? (
            <EmptyState title="No components found" description="Try another search or category." />
          ) : (
            <>
              <div className="hidden overflow-x-auto border border-border md:block">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left">
                    <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:text-muted-foreground">
                      <th>Component</th><th>Category</th><th>Data</th><th className="text-right">Weight</th><th className="text-right">Ref. price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.items.map((c) => (
                      <tr key={c.id} className="hover:bg-surface [&>td]:px-3 [&>td]:py-2">
                        <td>
                          <Link href={`/components/${c.slug}`} className="font-medium hover:text-accent">{c.name}</Link>
                          <span className="block text-xs text-muted-foreground">{c.brand_name}{c.model ? ` · ${c.model}` : ""}</span>
                        </td>
                        <td className="text-muted-foreground">{c.category_name}</td>
                        <td><ProvenanceBadge kind={c.verification_status as VerificationStatus} /></td>
                        <td className="text-right"><DataValue>{c.weight_g !== null ? formatWeight(c.weight_g) : null}</DataValue></td>
                        <td className="text-right"><DataValue>{c.price_reference !== null ? formatMoney(c.price_reference, c.currency) : null}</DataValue></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border border-y border-border md:hidden">
                {result.items.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <Link href={`/components/${c.slug}`} className="text-sm font-medium hover:text-accent">{c.name}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{c.category_name}</span>
                      <ProvenanceBadge kind={c.verification_status as VerificationStatus} />
                      <span className="figure">{formatWeight(c.weight_g)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Pagination page={query.page} pageCount={result.pageCount} basePath="/components" params={params} />
        </div>
      </div>
    </Container>
  );
}
