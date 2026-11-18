"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { NavLinks, type NavItem } from "./nav-links";

export function MobileNav({ items, signedIn }: { items: NavItem[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-4 py-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="px-4">
          <Logo />
        </div>
        <NavLinks items={items} vertical onNavigate={() => setOpen(false)} />
        {!signedIn && (
          <div className="mt-auto flex flex-col gap-2 px-4">
            <Button asChild variant="primary" onClick={() => setOpen(false)}>
              <Link href="/register">Create your garage</Link>
            </Button>
            <Button asChild variant="outline" onClick={() => setOpen(false)}>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
