import Link from "next/link";
import { MessageSquare, Star } from "lucide-react";
import { Avatar } from "@/components/common/avatar";
import { Badge } from "@/components/ui/badge";
import { avatarUrl } from "@/server/storage";
import { relativeTime } from "@/lib/format";
import type { FeedRow } from "@/types/domain";
import { LikeButton } from "./social-buttons";

export function PostCard({ post, coverUrl, signedIn }: { post: FeedRow; coverUrl: string | null; signedIn: boolean }) {
  return (
    <article className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row">
      {post.bicycle_id && (
        <Link href={`/bike/${post.author_username}/${post.bicycle_slug}`} className="block aspect-[16/10] w-full shrink-0 overflow-hidden border border-border bg-surface-sunken sm:w-48">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img src={coverUrl} alt={post.bicycle_name ?? ""} className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="hairline-grid grid size-full place-items-center text-xs text-muted-foreground">{post.bicycle_name}</div>
          )}
        </Link>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar url={avatarUrl(post.author_avatar_path)} name={post.author_display_name ?? post.author_username} size={20} />
          <Link href={`/profile/${post.author_username}`} className="hover:text-foreground">{post.author_display_name ?? post.author_username}</Link>
          <span>·</span>
          <time dateTime={post.created_at!}>{relativeTime(post.created_at!)}</time>
          {post.is_featured && <Badge tone="accent"><Star /> Featured</Badge>}
        </div>
        <Link href={`/community/${post.id}`} className="text-base font-medium leading-snug hover:text-accent">{post.title}</Link>
        {post.body && <p className="line-clamp-2 text-sm text-muted-foreground">{post.body}</p>}
        {post.bicycle_id && (
          <Link href={`/bike/${post.author_username}/${post.bicycle_slug}`} className="w-fit text-xs text-accent hover:underline">
            Passport: {post.bicycle_name}
          </Link>
        )}
        <div className="-ml-2 flex items-center gap-1">
          <LikeButton postId={post.id!} liked={!!post.liked_by_me} count={post.like_count ?? 0} signedIn={signedIn} />
          <Link href={`/community/${post.id}#comments`} className="inline-flex h-8 items-center gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground">
            <MessageSquare className="size-4" /> <span className="figure">{post.comment_count ?? 0}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
