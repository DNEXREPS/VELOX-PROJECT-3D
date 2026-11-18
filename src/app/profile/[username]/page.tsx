import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, MapPin } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionTitle } from "@/components/common/page-header";
import { Avatar } from "@/components/common/avatar";
import { BackendNotice } from "@/components/common/backend-notice";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { BikeCard } from "@/features/garage/bike-card";
import { FollowButton, ReportButton } from "@/features/community/social-buttons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "@/server/auth";
import { getProfileByUsername } from "@/server/queries/community";
import { avatarUrl } from "@/server/storage";
import { formatDate, relativeTime } from "@/lib/format";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: { params: Params }) {
  const { username } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const [data, session] = await Promise.all([getProfileByUsername(supabase, username), getSession()]);
  if (!data) notFound();
  const { profile, stats, bikes, posts } = data;
  const isSelf = session?.userId === profile.id;

  return (
    <Container wide>
      <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar url={avatarUrl(profile.avatar_path)} name={profile.display_name ?? profile.username} size={72} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{profile.display_name ?? profile.username}</h1>
            <p className="text-sm text-muted-foreground">@{profile.username} · joined {formatDate(profile.created_at, { month: "short", year: "numeric" })}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {profile.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {profile.location}</span>}
              {profile.website_url && (
                <a href={profile.website_url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-1 hover:text-foreground">
                  <Globe className="size-3" /> {profile.website_url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <dl className="flex gap-6 text-sm">
            {[["Bicycles", stats?.public_bicycle_count], ["Posts", stats?.post_count], ["Followers", stats?.follower_count], ["Following", stats?.following_count]].map(([l, v]) => (
              <div key={l as string}>
                <dt className="eyebrow">{l}</dt>
                <dd className="figure text-base">{v ?? 0}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2">
            {isSelf ? (
              <Button asChild variant="outline" size="sm"><Link href="/settings">Edit profile</Link></Button>
            ) : (
              <>
                <FollowButton profileId={profile.id} following={!!stats?.followed_by_me} signedIn={!!session} />
                <ReportButton targetType="profile" targetId={profile.id} signedIn={!!session} compact />
              </>
            )}
          </div>
        </div>
      </div>
      {profile.bio && <p className="max-w-2xl whitespace-pre-line py-4 text-sm text-muted-foreground">{profile.bio}</p>}

      <div className="grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <SectionTitle>Public bicycles</SectionTitle>
          {bikes.length === 0 ? (
            <EmptyState title="No public bicycles" description={isSelf ? "Make a bicycle public from its overview page to publish its passport." : undefined} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {bikes.map((b) => (
                <BikeCard key={b.id} data={{ href: `/bike/${profile.username}/${b.slug}`, name: b.name!, brand: b.brand, model: b.model, category: b.category, coverUrl: b.coverUrl, colorHex: b.color_hex, meta: <span className="figure">{b.component_count} parts · {b.bookmark_count} saves</span> }} />
              ))}
            </div>
          )}
        </section>
        <section>
          <SectionTitle>Posts</SectionTitle>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {posts.map((p) => (
                <li key={p.id} className="py-2.5">
                  <Link href={`/community/${p.id}`} className="text-sm hover:text-accent">{p.title}</Link>
                  <p className="text-xs text-muted-foreground">{relativeTime(p.created_at!)} · {p.like_count} likes · {p.comment_count} comments</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
