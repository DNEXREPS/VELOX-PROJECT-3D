import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, Search } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader, SectionTitle } from "@/components/common/page-header";
import { BackendNotice } from "@/components/common/backend-notice";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { Input } from "@/components/ui/input";
import { PostCard } from "@/features/community/post-card";
import { NewPostForm } from "@/features/community/post-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "@/server/auth";
import { getFeed, getFollowingIds, getMyBookmarks } from "@/server/queries/community";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { firstParams } from "@/lib/validation/schemas";

export const metadata: Metadata = { title: "Community", description: "Builds, upgrades and conversations from VELOX riders." };

const TABS = [
  { id: "latest", label: "Latest" },
  { id: "popular", label: "Popular" },
  { id: "featured", label: "Featured" },
  { id: "following", label: "Following" },
] as const;

const querySchema = z.object({
  tab: z.enum(["latest", "popular", "featured", "following"]).catch("latest"),
  q: z.string().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tab, q, page } = querySchema.parse(firstParams(await searchParams));
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const session = await getSession();
  const following = tab === "following" && session ? await getFollowingIds(supabase, session.userId) : undefined;
  const [feed, myBikes, saved] = await Promise.all([
    tab === "following" && !session
      ? Promise.resolve({ items: [], pageCount: 1 })
      : getFeed(supabase, { page, sort: tab === "popular" ? "popular" : "recent", featured: tab === "featured", following, q }),
    session ? supabase.from("bicycles").select("id, name").eq("owner_id", session.userId).eq("visibility", "public").order("name") : Promise.resolve({ data: [] }),
    session ? getMyBookmarks(supabase, session.userId) : Promise.resolve([]),
  ]);

  return (
    <Container wide>
      <PageHeader eyebrow="Community" title="Community" description="Share builds and upgrades. Posts can link to a bicycle’s Digital Bike Passport." />
      <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
            <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Feed">
              {TABS.map((t) => (
                <Link
                  key={t.id}
                  href={t.id === "latest" ? "/community" : `/community?tab=${t.id}`}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={cn("shrink-0 border-b-2 px-3 py-2.5 text-sm", tab === t.id ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <form action="/community" className="relative pb-2 sm:w-64 sm:pb-0">
              {tab !== "latest" && <input type="hidden" name="tab" value={tab} />}
              <Search className="pointer-events-none absolute left-3 top-[18px] size-4 -translate-y-1/2 text-subtle-foreground sm:top-1/2" />
              <Input name="q" defaultValue={q} placeholder="Search posts" className="pl-9" aria-label="Search posts" />
            </form>
          </div>
          {tab === "following" && !session ? (
            <EmptyState className="mt-6" title="Sign in to see riders you follow" action={<Link href="/login?next=/community?tab=following" className="text-sm text-accent hover:underline">Sign in</Link>} />
          ) : feed.items.length === 0 ? (
            <EmptyState className="mt-6" icon={<MessagesSquare />} title="No posts here yet" description={tab === "following" ? "Follow riders from their profiles to fill this feed." : "Be the first to share a build."} />
          ) : (
            <div>{feed.items.map((p) => <PostCard key={p.id} post={p} coverUrl={p.coverUrl} signedIn={!!session} />)}</div>
          )}
          <Pagination page={page} pageCount={feed.pageCount} basePath="/community" params={{ tab: tab === "latest" ? undefined : tab, q }} />
        </div>
        <aside className="flex flex-col gap-8">
          <section>
            <SectionTitle>New post</SectionTitle>
            {session ? (
              <NewPostForm bikes={myBikes.data ?? []} />
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link href="/login?next=/community" className="text-accent hover:underline">Sign in</Link> to post, like and comment.
              </p>
            )}
          </section>
          {session && (
            <section>
              <SectionTitle>Saved builds</SectionTitle>
              {saved.length === 0 ? (
                <p className="text-sm text-muted-foreground">Save builds from their passports to keep them here.</p>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {saved.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/bike/${b.owner_username}/${b.slug}`} className="truncate hover:text-accent">{b.name}</Link>
                      <span className="shrink-0 text-xs text-muted-foreground">@{b.owner_username}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </Container>
  );
}
