"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/common/form";
import { deleteBicycleImage, setCoverImage, uploadBicycleImage } from "@/server/actions/bicycles";
import { IMAGE_MAX_BYTES } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";

interface Img {
  id: string;
  storage_path: string;
  caption: string | null;
  url: string | null;
}

export function GalleryManager({ bikeId, images, coverPath }: { bikeId: string; images: Img[]; coverPath: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { kind: "success", text: res.message ?? "Done." } : { kind: "error", text: res.error ?? "Failed." });
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((img) => {
            const isCover = img.storage_path === coverPath;
            return (
              <li key={img.id} className={cn("group relative aspect-[4/3] overflow-hidden border bg-surface-sunken", isCover ? "border-accent" : "border-border")}>
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img src={img.url} alt={img.caption ?? ""} className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid size-full place-items-center text-xs text-muted-foreground">Unavailable</div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/85 p-1">
                  <span className="truncate px-1 text-[11px] text-muted-foreground">{isCover ? "Cover" : img.caption}</span>
                  <span className="flex gap-0.5">
                    {!isCover && (
                      <Button size="icon-sm" variant="ghost" aria-label="Set as cover" disabled={pending} onClick={() => run(() => setCoverImage(img.id))}>
                        <Star />
                      </Button>
                    )}
                    <Button size="icon-sm" variant="ghost" aria-label="Delete image" disabled={pending} onClick={() => confirm("Delete this image?") && run(() => deleteBicycleImage(img.id))}>
                      <Trash2 />
                    </Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        ref={formRef}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const file = fd.get("file");
          if (file instanceof File && file.size > IMAGE_MAX_BYTES) return setMsg({ kind: "error", text: "Image must be 5 MB or smaller." });
          fd.set("bicycleId", bikeId);
          run(async () => {
            const res = await uploadBicycleImage(fd);
            if (res.ok) formRef.current?.reset();
            return res;
          });
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Photo (JPEG, PNG or WebP, max 5 MB)
          <Input type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="py-1.5 file:mr-3 file:border-0 file:bg-surface-raised file:px-2 file:text-xs file:text-foreground" />
        </label>
        <Input name="caption" placeholder="Caption (optional)" maxLength={200} className="sm:w-48" aria-label="Caption" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground sm:pb-2.5">
          <input type="checkbox" name="makeCover" className="accent-[var(--accent)]" /> Cover
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          <ImagePlus /> {pending ? "Uploading…" : "Upload"}
        </Button>
      </form>
    </div>
  );
}
