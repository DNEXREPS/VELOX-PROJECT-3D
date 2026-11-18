"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function BikeTabs({ bikeId }: { bikeId: string }) {
  const pathname = usePathname();
  const base = `/garage/${bikeId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/studio`, label: "3D Studio" },
    { href: `${base}/components`, label: "Components" },
    { href: `${base}/analytics`, label: "Analytics" },
    { href: `${base}/maintenance`, label: "Maintenance" },
    { href: `${base}/history`, label: "History" },
  ];
  return (
    <nav className="scrollbar-thin -mb-px flex gap-1 overflow-x-auto" aria-label="Bicycle sections">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
