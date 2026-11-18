import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Avatar({ url, name, size = 32, className }: { url: string | null | undefined; name: string | null | undefined; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-raised text-[11px] font-medium text-muted-foreground", className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars are small public-bucket images
        <img src={url} alt="" width={size} height={size} className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
