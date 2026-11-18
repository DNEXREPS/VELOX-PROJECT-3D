"use client";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Flag, Heart, Trash2, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/common/form";
import { deleteComment, deletePost, reportContent, toggleBookmark, toggleFollow, toggleLike } from "@/server/actions/community";
import { REPORT_REASONS, REPORT_REASON_LABEL, type ReportTarget } from "@/lib/domain/bicycle";
import { cn } from "@/lib/utils";

function useSignInRedirect() {
  const router = useRouter();
  return () => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
}

export function LikeButton({ postId, liked, count, signedIn }: { postId: string; liked: boolean; count: number; signedIn: boolean }) {
  const toLogin = useSignInRedirect();
  const [state, setState] = useState({ liked, count });
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={optimistic.liked}
      aria-label={optimistic.liked ? "Unlike" : "Like"}
      className={cn(optimistic.liked && "text-accent hover:text-accent")}
      onClick={() => {
        if (!signedIn) return toLogin();
        start(async () => {
          const next = { liked: !optimistic.liked, count: optimistic.count + (optimistic.liked ? -1 : 1) };
          setOptimistic(next);
          const res = await toggleLike(postId);
          if (res.ok) setState({ liked: res.data.liked, count: state.count + (res.data.liked === state.liked ? 0 : res.data.liked ? 1 : -1) });
        });
      }}
    >
      <Heart className={cn(optimistic.liked && "fill-current")} />
      <span className="figure">{optimistic.count}</span>
    </Button>
  );
}

export function BookmarkButton({ bicycleId, bookmarked, count, signedIn }: { bicycleId: string; bookmarked: boolean; count: number; signedIn: boolean }) {
  const toLogin = useSignInRedirect();
  const [state, setState] = useState({ bookmarked, count });
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-pressed={state.bookmarked}
      className={cn(state.bookmarked && "border-accent/50 text-accent")}
      onClick={() => {
        if (!signedIn) return toLogin();
        start(async () => {
          const res = await toggleBookmark(bicycleId);
          if (res.ok) setState((s) => ({ bookmarked: res.data.bookmarked, count: s.count + (res.data.bookmarked ? 1 : -1) }));
        });
      }}
    >
      <Bookmark className={cn(state.bookmarked && "fill-current")} />
      {state.bookmarked ? "Saved" : "Save build"}
      <span className="figure text-muted-foreground">{state.count}</span>
    </Button>
  );
}

export function FollowButton({ profileId, following, signedIn }: { profileId: string; following: boolean; signedIn: boolean }) {
  const toLogin = useSignInRedirect();
  const router = useRouter();
  const [isFollowing, setFollowing] = useState(following);
  const [pending, start] = useTransition();
  return (
    <Button
      variant={isFollowing ? "outline" : "primary"}
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!signedIn) return toLogin();
        start(async () => {
          const res = await toggleFollow(profileId);
          if (res.ok) {
            setFollowing(res.data.following);
            router.refresh();
          }
        });
      }}
    >
      {isFollowing ? <UserCheck /> : <UserPlus />}
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}

export function ReportButton({ targetType, targetId, signedIn, compact }: { targetType: ReportTarget; targetId: string; signedIn: boolean; compact?: boolean }) {
  const toLogin = useSignInRedirect();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn)
    return (
      <Button variant="ghost" size={compact ? "icon-sm" : "sm"} onClick={toLogin} aria-label="Report">
        <Flag /> {!compact && "Report"}
      </Button>
    );
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setMsg(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size={compact ? "icon-sm" : "sm"} aria-label="Report">
          <Flag /> {!compact && "Report"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {targetType}</DialogTitle>
          <DialogDescription>Reports are private and reviewed by VELOX moderators.</DialogDescription>
        </DialogHeader>
        {msg ? (
          <FormMessage kind={msg.kind}>{msg.text}</FormMessage>
        ) : (
          <>
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
              {REPORT_REASONS.map((r) => <option key={r} value={r}>{REPORT_REASON_LABEL[r]}</option>)}
            </NativeSelect>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" maxLength={1000} rows={3} aria-label="Details" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await reportContent({ target_type: targetType, target_id: targetId, reason, details });
                    setMsg(res.ok ? { kind: "success", text: res.message ?? "Reported." } : { kind: "error", text: res.error });
                  })
                }
              >
                Submit report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteContentButton({ kind, id, redirectTo }: { kind: "post" | "comment"; id: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Delete ${kind}`}
      onClick={() =>
        confirm(`Delete this ${kind}? This cannot be undone.`) &&
        start(async () => {
          const res = kind === "post" ? await deletePost(id) : await deleteComment(id);
          if (res.ok) {
            if (redirectTo) router.push(redirectTo);
            router.refresh();
          } else alert(res.error);
        })
      }
    >
      <Trash2 /> Delete
    </Button>
  );
}
