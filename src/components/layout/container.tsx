import { cn } from "@/lib/utils";

export function Container({ children, className, wide = false }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", wide ? "max-w-[1440px]" : "max-w-[1200px]", className)}>{children}</div>;
}
