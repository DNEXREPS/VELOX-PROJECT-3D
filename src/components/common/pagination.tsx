import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Server-rendered pagination: preserves existing query params. */
export function Pagination({ page, pageCount, basePath, params }: { page: number; pageCount: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-surface-raised";
  return (
    <nav className="flex items-center justify-between gap-3 pt-6" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkCls} rel="prev">
          <ChevronLeft className="size-4" /> Previous
        </Link>
      ) : (
        <span className={cn(linkCls, "pointer-events-none opacity-40")} aria-disabled>
          <ChevronLeft className="size-4" /> Previous
        </span>
      )}
      <span className="figure text-xs text-muted-foreground">
        {page} / {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkCls} rel="next">
          Next <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(linkCls, "pointer-events-none opacity-40")} aria-disabled>
          Next <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
