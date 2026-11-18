import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionTitle } from "@/components/common/page-header";
import { SpecTable } from "@/components/common/data-value";
import { ProvenanceBadge } from "@/components/common/provenance";
import { BackendNotice } from "@/components/common/backend-notice";
import { DeleteComponentButton } from "@/features/components/submit-component";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "@/server/auth";
import { countInstallations, getComponentBySlug } from "@/server/queries/components";
import { ATTRIBUTES, describeValue } from "@/lib/compatibility/attributes";
import { RULES } from "@/lib/compatibility/rules";
import { SLOT_META, isBikeSlot } from "@/lib/domain/slots";
import type { VerificationStatus } from "@/lib/domain/bicycle";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { title: "Component" };
  const { data } = await supabase.from("component_catalog").select("name, brand_name").eq("slug", slug).maybeSingle();
  return { title: data ? `${data.name} — ${data.brand_name}` : "Component not found" };
}

export default async function ComponentDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const [c, session] = await Promise.all([getComponentBySlug(supabase, slug), getSession()]);
  if (!c) notFound();
  const installs = await countInstallations(supabase, c.id);
  const brand = c.brand as unknown as { name: string; website_url: string | null; is_demo: boolean } | null;
  const category = c.category as unknown as { slug: string; name: string; slots: string[] } | null;
  const canDelete = session && c.created_by === session.userId && c.verification_status === "user_submitted";
  const attrKeys = Object.keys(c.attributes);
  const relevantRules = RULES.filter((r) => attrKeys.includes(r.a.attribute) || attrKeys.includes(r.b.attribute));
  const images = (c.images as unknown as { url: string; alt: string | null }[]) ?? [];

  return (
    <Container>
      <Link href={`/components${category ? `?category=${category.slug}` : ""}`} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> {category?.name ?? "Components"}
      </Link>
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow">{brand?.name}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProvenanceBadge kind={c.verification_status as VerificationStatus} />
            {c.model && <span className="figure text-xs text-muted-foreground">{c.model}</span>}
          </div>
        </div>
        {canDelete && <DeleteComponentButton componentId={c.id} />}
      </div>

      {c.verification_status === "demo" && (
        <p className="mt-4 border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          Demo data: this is a fictional sample component shipped with VELOX. Its values are illustrative and are not manufacturer specifications.
        </p>
      )}

      <div className="grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- external/manufacturer imagery declared in data
                <img key={i} src={img.url} alt={img.alt ?? c.name} className="h-48 border border-border object-contain" loading="lazy" />
              ))}
            </div>
          )}
          {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
          <section>
            <SectionTitle>Technical specifications</SectionTitle>
            {c.specValues.length === 0 ? (
              <p className="text-sm italic text-subtle-foreground">No specifications recorded. Values are left unavailable rather than estimated.</p>
            ) : (
              <SpecTable items={c.specValues.map((s) => ({ label: s.label, value: `${s.value}${s.unit ? ` ${s.unit}` : ""}`, hint: <ProvenanceBadge kind={s.source === "manufacturer" ? "manufacturer_verified" : s.source === "demo" ? "demo" : s.source === "community" ? "community_verified" : "user"} /> }))} />
            )}
          </section>
          <section>
            <SectionTitle>Compatibility attributes</SectionTitle>
            {attrKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compatibility data — checks involving this part will show “Requires verification”.</p>
            ) : (
              <>
                <SpecTable items={attrKeys.map((k) => ({ label: ATTRIBUTES[k]?.label ?? k, value: describeValue(k, c.attributes[k]) }))} />
                <p className="mt-3 text-xs text-muted-foreground">Used by {relevantRules.length} compatibility rule(s): {relevantRules.map((r) => r.label).join(", ")}.</p>
              </>
            )}
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          <SpecTable
            items={[
              { label: "Category", value: category?.name },
              { label: "Fits positions", value: (category?.slots ?? []).filter(isBikeSlot).map((s) => SLOT_META[s].label).join(", ") || null },
              { label: "Weight", value: c.weight_g !== null ? formatWeight(c.weight_g) : null },
              { label: "Material", value: c.material },
              { label: "Reference price", value: c.price_reference !== null ? formatMoney(c.price_reference, c.currency) : null },
              { label: "Manufacturer ref.", value: c.manufacturer_ref },
              { label: "In public builds", value: installs },
              { label: "Last updated", value: formatDate(c.updated_at) },
            ]}
          />
          {c.source_url ? (
            <a href={c.source_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-sm text-accent hover:underline">
              Data source <ExternalLink className="size-3" />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No data source cited.</p>
          )}
          {brand?.website_url && (
            <a href={brand.website_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {brand.name} website <ExternalLink className="size-3" />
            </a>
          )}
        </aside>
      </div>
    </Container>
  );
}
