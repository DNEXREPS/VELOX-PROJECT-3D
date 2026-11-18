import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionTitle } from "@/components/common/page-header";
import { Avatar } from "@/components/common/avatar";
import { BackendNotice } from "@/components/common/backend-notice";
import { Badge } from "@/components/ui/badge";
import { CommentForm } from "@/features/community/post-forms";
import { DeleteContentButton, LikeButton, ReportButton } from "@/features/community/social-buttons";
import { FeatureToggle, HideContentButton } from "@/features/community/moderation-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession, isModeratorRole } from "@/server/auth";
import { getPost } from "@/server/queries/community";
import { avatarUrl } from "@/server/storage";
import { relativeTime } from "@/lib/format";

type Params = Promise<{ postId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { postId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase || !z.uuid().safeParse(postId).success) return { title: "Post" };
  const { data } = await supabase.from("community_feed").select("title").eq("id", postId).maybeSingle();
  return { title: data?.title ?? "Post not found" };
}

export default async function PostPage({ params }: { params: Params }) {
  const { postId } = await params;
  if (!z.uuid().safeParse(postId).success) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <Container><BackendNotice /></Container>;
  const [data, session] = await Promise.all([getPost(supabase, postId), getSession()]);
  if (!data) notFound();
  const { post, comments } = data;
  const isAuthor = session?.userId === post.author_id;
  const isMod = session ? isModeratorRole(session.profile.role) : false;

  return (
    <Container className="max-w-3xl">
      <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> Community</Link>
      <article className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Avatar url={avatarUrl(post.author_avatar_path)} name={post.author_display_name ?? post.author_username} size={28} />
          <Link href={`/profile/${post.author_username}`} className="hover:text-foreground">{post.author_display_name ?? post.author_username}</Link>
          <span>·</span>
          <time dateTime={post.created_at!}>{relativeTime(post.created_at!)}</time>
          {post.is_featured && <Badge tone="accent">Featured</Badge>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
        {post.bicycle_id && (
          <Link href={`/bike/${post.author_username}/${post.bicycle_slug}`} className="flex items-center gap-3 border border-border p-2 hover:border-border-strong">
            <div className="h-14 w-20 shrink-0 overflow-hidden bg-surface-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              {post.coverUrl && <img src={post.coverUrl} alt="" className="size-full object-cover" />}
            </div>
            <div className="min-w-0">
              <span className="eyebrow">Digital Bike Passport</span>
              <p className="truncate text-sm">{post.bicycle_name}</p>
            </div>
          </Link>
        )}
        {post.body && <div className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{post.body}</div>}
        <div className="-ml-2 flex flex-wrap items-center gap-1">
          <LikeButton postId={post.id!} liked={!!post.liked_by_me} count={post.like_count ?? 0} signedIn={!!session} />
          {!isAuthor && <ReportButton targetType="post" targetId={post.id!} signedIn={!!session} />}
          {(isAuthor || isMod) && <DeleteContentButton kind="post" id={post.id!} redirectTo="/community" />}
          {isMod && <FeatureToggle postId={post.id!} featured={!!post.is_featured} />}
          {isMod && !isAuthor && <HideContentButton targetType="post" targetId={post.id!} />}
        </div>
      </article>

      <section id="comments" className="pt-6">
        <SectionTitle>Comments <span className="figure ml-1 text-xs font-normal text-muted-foreground">{comments.length}</span></SectionTitle>
        <ul className="flex flex-col divide-y divide-border">
          {comments.map((c) => {
            const author = c.author as unknown as { username: string; display_name: string | null; avatar_path: string | null } | null;
            return (
              <li key={c.id} className="flex gap-3 py-3">
                <Avatar url={avatarUrl(author?.avatar_path)} name={author?.display_name ?? author?.username} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Link href={`/profile/${author?.username}`} className="text-foreground hover:text-accent">{author?.display_name ?? author?.username}</Link>
                    <span>{relativeTime(c.created_at)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{c.body}</p>
                  <div className="-ml-2 mt-1 flex gap-1">
                    {(session?.userId === c.author_id || isMod) && <DeleteContentButton kind="comment" id={c.id} />}
                    {session?.userId !== c.author_id && <ReportButton targetType="comment" targetId={c.id} signedIn={!!session} compact />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4">
          {session ? <CommentForm postId={post.id!} /> : <p className="text-sm text-muted-foreground"><Link href={`/login?next=/community/${post.id}`} className="text-accent hover:underline">Sign in</Link> to comment.</p>}
        </div>
      </section>
    </Container>
  );
}
