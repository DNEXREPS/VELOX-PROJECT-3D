import Link from "next/link";
import { getSession, isModeratorRole } from "@/server/auth";
import { avatarUrl } from "@/server/storage";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { NavLinks, type NavItem } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

const PUBLIC_NAV: NavItem[] = [
  { href: "/explore", label: "Explore" },
  { href: "/community", label: "Community" },
  { href: "/components", label: "Components" },
];
const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/garage", label: "Garage" },
];

export async function SiteHeader() {
  const session = await getSession();
  const items = session ? [...APP_NAV, ...PUBLIC_NAV] : PUBLIC_NAV;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <MobileNav items={items} signedIn={!!session} />
        <Logo />
        <NavLinks items={items} className="ml-6 hidden md:flex" />
        <div className="ml-auto flex items-center gap-2">
          {session ? (
            <UserMenu
              username={session.profile.username}
              displayName={session.profile.display_name}
              avatarUrl={avatarUrl(session.profile.avatar_path)}
              isModerator={isModeratorRole(session.profile.role)}
            />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm" className="hidden sm:inline-flex">
                <Link href="/register">Create garage</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span>Digital Garage</span>
        </div>
        <p className="max-w-xl">
          Component data carries its provenance. Entries marked <span className="text-warning">Demo data</span> are fictional samples, not manufacturer specifications.
        </p>
        <nav className="flex gap-4">
          <Link href="/explore" className="hover:text-foreground">Explore</Link>
          <Link href="/components" className="hover:text-foreground">Components</Link>
          <Link href="/community" className="hover:text-foreground">Community</Link>
        </nav>
      </div>
    </footer>
  );
}
