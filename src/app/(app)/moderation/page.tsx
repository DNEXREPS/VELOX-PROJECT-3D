import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { ReportActions } from "@/features/community/report-queue";
import { requireSession, isModeratorRole } from "@/server/auth";
import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/domain/bicycle";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Moderation" };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession("/moderation");
  if (!isModeratorRole(session.profile.role)) notFound();
  const { status } = await searchParams;
  const showClosed = status === "closed";
  const { data: reports } = await session.supabase
    .from("content_reports")
    .select("*, reporter:profiles!content_reports_reporter_id_fkey(username)")
    .in("status", showClosed ? ["resolved", "dismissed"] : ["open", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(100);

  // Resolve link targets (moderators can read hidden posts/comments via RLS).
  const postIds = (reports ?? []).filter((r) => r.target_type === "post").map((r) => r.target_id);
  const commentIds = (reports ?? []).filter((r) => r.target_type === "comment").map((r) => r.target_id);
  const profileIds = (reports ?? []).filter((r) => r.target_type === "profile").map((r) => r.target_id);
  const [{ data: posts }, { data: comments }, { data: profiles }] = await Promise.all([
    postIds.length ? session.supabase.from("community_posts").select("id, title, status").in("id", postIds) : Promise.resolve({ data: [] as { id: string; title: string; status: string }[] }),
    commentIds.length ? session.supabase.from("post_comments").select("id, post_id, body, status").in("id", commentIds) : Promise.resolve({ data: [] as { id: string; post_id: string; body: string; status: string }[] }),
    profileIds.length ? session.supabase.from("profiles").select("id, username").in("id", profileIds) : Promise.resolve({ data: [] as { id: string; username: string }[] }),
  ]);

  const describe = (type: string, id: string) => {
    if (type === "post") { const p = posts?.find((x) => x.id === id); return p ? { label: p.title, href: `/community/${p.id}`, state: p.status } : null; }
    if (type === "comment") { const c = comments?.find((x) => x.id === id); return c ? { label: c.body.slice(0, 120), href: `/community/${c.post_id}#comments`, state: c.status } : null; }
    if (type === "profile") { const p = profiles?.find((x) => x.id === id); return p ? { label: `@${p.username}`, href: `/profile/${p.username}`, state: null } : null; }
    return { label: `Bicycle ${id.slice(0, 8)}…`, href: null, state: null };
  };

  return (
    <Container wide>
      <PageHeader
        eyebrow="Moderator"
        title="Moderation queue"
        description="Review reports. Hiding content removes it from public view without deleting it."
        actions={
          <div className="flex gap-2 text-sm">
            <Link href="/moderation" className={!showClosed ? "text-foreground" : "text-muted-foreground hover:text-foreground"}>Open</Link>
            <span className="text-border-strong">/</span>
            <Link href="/moderation?status=closed" className={showClosed ? "text-foreground" : "text-muted-foreground hover:text-foreground"}>Closed</Link>
          </div>
        }
      />
      {!reports?.length ? (
        <EmptyState className="mt-6" icon={<ShieldCheck />} title={showClosed ? "No closed reports" : "No open reports"} />
      ) : (
        <ul className="divide-y divide-border border-b border-border">
          {reports.map((r) => {
            const target = describe(r.target_type, r.target_id);
            const reporter = r.reporter as unknown as { username: string } | null;
            return (
              <li key={r.id} className="flex flex-col gap-2 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge tone="danger">{REPORT_REASON_LABEL[r.reason as ReportReason]}</Badge>
                    <Badge>{r.target_type}</Badge>
                    {target?.state && target.state !== "published" && <Badge tone="warning">{target.state}</Badge>}
                    <span>by @{reporter?.username ?? "unknown"} · {relativeTime(r.created_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm">
                    {target?.href ? <Link href={target.href} className="hover:text-accent">{target.label}</Link> : (target?.label ?? "Target no longer exists")}
                  </p>
                  {r.details && <p className="mt-1 text-sm text-muted-foreground">“{r.details}”</p>}
                  {r.resolution_note && <p className="mt-1 text-xs text-muted-foreground">Resolution: {r.resolution_note}</p>}
                </div>
                {!showClosed && <ReportActions reportId={r.id} targetType={r.target_type} targetId={r.target_id} />}
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
