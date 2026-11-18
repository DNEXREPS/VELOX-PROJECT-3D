import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fingerprint, Lock } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionTitle } from "@/components/common/page-header";
import { SpecTable } from "@/components/common/data-value";
import { ProvenanceBadge } from "@/components/common/provenance";
import { Avatar } from "@/components/common/avatar";
import { BackendNotice } from "@/components/common/backend-notice";
import { Badge } from "@/components/ui/badge";
import { LazyBikeViewer } from "@/features/studio/three/LazyBikeViewer";
import { RevisionList } from "@/features/history/revision-list";
import { BookmarkButton, ReportButton } from "@/features/community/social-buttons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "@/server/auth";
import { getPassport } from "@/server/queries/community";
import { avatarUrl } from "@/server/storage";
import { CATEGORY_LABEL, MAINTENANCE_TYPE_LABEL, MATERIAL_LABEL, type MaintenanceType } from "@/lib/domain/bicycle";
import { BIKE_SLOTS, SLOT_META, isBikeSlot, slotLabel, type BikeSlot } from "@/lib/domain/slots";
import { formatDate, formatKg, formatMoney, formatNumber, formatWeight, relativeTime } from "@/lib/format";
import { siteUrl } from "@/lib/env";

type Params = Promise<{ username: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { title: "Bike passport" };
  const { data } = await supabase.from("bicycle_passports").select("name, brand, model, owner_username").eq("owner_username", username.toLowerCase()).eq("slug", slug).maybeSingle();
  if (!data) return { title: "Bike not found" };
  return {
    title: `${data.name} — Digital Bike Passport`,
    description: `${[data.brand, data.model].filter(Boolean).join(" ")} build by @${data.owner_username} on VELOX.`,
    alternates: { canonical: `/bike/${data.owner_username}/${slug}` },
  };
}

export default async function PassportPage({ params }: { params: Params }) {
  const { username, slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const [passport, session] = await Promise.all([getPassport(supabase, username, slug), getSession()]);
  if (!passport) notFound();
  const { bike, coverUrl, components, revisions, maintenance, images, posts } = passport;
  const isOwner = session?.userId === bike.owner_id;
  const bySlot = new Map(components.map((c) => [c.slot as BikeSlot, c]));
  const known = components.filter((c) => c.slot !== "groupset" && c.weight_g !== null);
  const componentWeight = known.length ? known.reduce((s, c) => s + (c.weight_g ?? 0), 0) : null;

  return (
    <div>
      <div className="border-b border-border">
        <div className="mx-auto grid grid-cols-1 max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent"><Fingerprint /> Digital Bike Passport</Badge>
              {isOwner && <Badge>You own this bicycle</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{bike.name}</h1>
            <p className="text-sm text-muted-foreground">{[bike.brand, bike.model, bike.model_year, bike.category ? CATEGORY_LABEL[bike.category] : null].filter(Boolean).join(" · ")}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="aspect-[16/10] overflow-hidden border border-border bg-surface-sunken">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img src={coverUrl} alt={`${bike.name} cover`} className="size-full object-cover" />
                ) : (
                  <div className="hairline-grid grid size-full place-items-center text-xs text-muted-foreground">No photo published</div>
                )}
              </div>
              <LazyBikeViewer modelKey={bike.model_key} paintColor={bike.color_hex} recordedSlots={bike.show_components ? (components.map((c) => c.slot).filter(isBikeSlot) as BikeSlot[]) : null} className="aspect-[16/10] border border-border" />
            </div>
            {images.length > 1 && (
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img) =>
                  img.url ? (
                    <li key={img.id} className="h-20 w-28 shrink-0 overflow-hidden border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                      <img src={img.url} alt={img.caption ?? ""} className="size-full object-cover" loading="lazy" />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            <Link href={`/profile/${bike.owner_username}`} className="flex items-center gap-3 border border-border p-3 hover:border-border-strong">
              <Avatar url={avatarUrl(bike.owner_avatar_path)} name={bike.owner_display_name ?? bike.owner_username} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{bike.owner_display_name ?? bike.owner_username}</p>
                <p className="text-xs text-muted-foreground">@{bike.owner_username}</p>
              </div>
            </Link>
            <div className="flex flex-wrap gap-2">
              <BookmarkButton bicycleId={bike.id!} bookmarked={!!bike.bookmarked_by_me} count={bike.bookmark_count ?? 0} signedIn={!!session} />
              {!isOwner && <ReportButton targetType="bicycle" targetId={bike.id!} signedIn={!!session} />}
              {isOwner && <Link href={`/garage/${bike.id}`} className="inline-flex h-8 items-center px-3 text-[13px] text-accent hover:underline">Manage in garage</Link>}
            </div>
            <SpecTable
              items={[
                { label: "Category", value: bike.category ? CATEGORY_LABEL[bike.category] : null },
                { label: "Frame material", value: bike.frame_material ? MATERIAL_LABEL[bike.frame_material] : null },
                { label: "Frame size", value: bike.frame_size },
                { label: "Colour", value: bike.color },
                ...(bike.show_weight ? [{ label: "Weight (owner-measured)", value: bike.weight_kg ? formatKg(bike.weight_kg) : null }] : []),
                ...(bike.show_components ? [{ label: "Known component weight", value: componentWeight !== null ? `${formatWeight(componentWeight)} (${known.length}/${components.filter((c) => c.slot !== "groupset").length})` : null }] : []),
                ...(bike.show_value ? [{ label: "Estimated value", value: bike.estimated_value ? formatMoney(bike.estimated_value, bike.value_currency) : null }] : []),
              ]}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-px size-3 shrink-0" /> Serial number and purchase details are never published. Field visibility is controlled by the owner.
            </p>
          </aside>
        </div>
      </div>

      <Container wide className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-10">
          {bike.description && (
            <section>
              <SectionTitle>About this build</SectionTitle>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{bike.description}</p>
            </section>
          )}
          {bike.show_components && (
            <section>
              <SectionTitle>Build specification</SectionTitle>
              {components.length === 0 ? (
                <p className="text-sm text-muted-foreground">No components recorded.</p>
              ) : (
                <ul className="divide-y divide-border border-y border-border text-sm">
                  {BIKE_SLOTS.filter((s) => bySlot.has(s)).map((s) => {
                    const c = bySlot.get(s)!;
                    return (
                      <li key={s} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 py-2 sm:grid-cols-[150px_minmax(0,1fr)_auto_auto]">
                        <span className="text-xs text-muted-foreground">{SLOT_META[s].label}</span>
                        <span className="min-w-0">
                          {c.component_slug ? <Link href={`/components/${c.component_slug}`} className="hover:text-accent">{c.name}</Link> : c.name}
                          {c.brand_name && <span className="block truncate text-xs text-muted-foreground">{c.brand_name}</span>}
                        </span>
                        <span className="hidden sm:block"><ProvenanceBadge kind={c.component_id ? (c.verification_status ?? null) : "custom"} /></span>
                        <span className="figure text-right text-xs text-muted-foreground">{c.weight_g ? formatWeight(c.weight_g) : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {bike.show_maintenance && (
            <section>
              <SectionTitle>Maintenance log</SectionTitle>
              {maintenance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No maintenance published.</p>
              ) : (
                <ul className="divide-y divide-border border-y border-border text-sm">
                  {maintenance.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="figure w-24 shrink-0 text-xs text-muted-foreground">{formatDate(m.performed_on)}</span>
                        <span className="truncate">{m.title}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[MAINTENANCE_TYPE_LABEL[m.maintenance_type as MaintenanceType], m.slot ? slotLabel(m.slot) : null, m.distance_km !== null ? formatNumber(m.distance_km, "km") : null, m.cost !== null ? formatMoney(m.cost, m.currency) : null].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-10">
          {bike.show_history && (
            <section>
              <SectionTitle>Build history</SectionTitle>
              {revisions.length ? (
                <RevisionList revisions={revisions.map((r) => ({ id: r.id!, revision_number: r.revision_number!, description: r.description, created_at: r.created_at!, changes: r.changes }))} max={8} />
              ) : (
                <p className="text-sm text-muted-foreground">No revisions published.</p>
              )}
            </section>
          )}
          <section>
            <SectionTitle>Community posts</SectionTitle>
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts about this build yet.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {posts.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link href={`/community/${p.id}`} className="text-sm hover:text-accent">{p.title}</Link>
                    <p className="text-xs text-muted-foreground">{relativeTime(p.created_at!)} · {p.like_count} likes · {p.comment_count} comments</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="text-xs text-muted-foreground">
            Share: <span className="figure break-all text-foreground">{`${siteUrl()}/bike/${bike.owner_username}/${bike.slug}`}</span>
          </section>
        </aside>
      </Container>
    </div>
  );
}
