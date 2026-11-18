import Link from "next/link";
import { cn } from "@/lib/utils";

export function VeloxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 20" className={cn("h-4 w-auto", className)} aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="13" r="5" />
      <circle cx="26" cy="13" r="5" />
      <path d="M6 13 12 4h9l5 9M12 4l4 9h-10" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-foreground", className)} aria-label="VELOX Digital Garage — home">
      <VeloxMark className="text-accent" />
      <span className="text-sm font-semibold tracking-[0.2em]">VELOX</span>
    </Link>
  );
}
