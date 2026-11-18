"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moderateContent, setPostFeatured } from "@/server/actions/moderation";
import type { ReportTarget } from "@/lib/domain/bicycle";

export function FeatureToggle({ postId, featured }: { postId: string; featured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await setPostFeatured(postId, !featured); router.refresh(); })}>
      <Star className={featured ? "fill-current text-accent" : undefined} /> {featured ? "Unfeature" : "Feature"}
    </Button>
  );
}

export function HideContentButton({ targetType, targetId, label = "Hide" }: { targetType: ReportTarget; targetId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        confirm("Hide this content from the public?") &&
        start(async () => {
          const res = await moderateContent({ targetType, targetId, status: "hidden" });
          if (!res.ok) alert(res.error);
          router.refresh();
        })
      }
    >
      <EyeOff /> {label}
    </Button>
  );
}
