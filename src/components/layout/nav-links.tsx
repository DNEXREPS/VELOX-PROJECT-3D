"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items, className, vertical = false, onNavigate }: { items: NavItem[]; className?: string; vertical?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className={cn(vertical ? "flex flex-col" : "flex items-center gap-1", className)}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-sm transition-colors",
              vertical ? "border-l-2 px-4 py-2.5" : "rounded-md px-3 py-1.5",
              active
                ? vertical
                  ? "border-accent bg-surface-raised text-foreground"
                  : "bg-surface-raised text-foreground"
                : vertical
                  ? "border-transparent text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
