import Link from "next/link";
import { ArrowRight, Boxes, Compass, Fingerprint, History, Warehouse, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { SectionTitle } from "@/components/common/page-header";
import { BikeCard } from "@/features/garage/bike-card";
import { HeroViewer } from "@/features/landing/hero-viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { explorePublicBikes } from "@/server/queries/community";
import { getSession } from "@/server/auth";
import { RULES } from "@/lib/compatibility/rules";

const CAPABILITIES = [
  { icon: Warehouse, title: "Personal digital garage", body: "Every bicycle gets an identity: specification, photos, value, private serial and purchase records.", href: "/garage" },
  { icon: Boxes, title: "Interactive 3D studio", body: "Select parts on the model, compare compatible options, preview replacements and confirm changes.", href: "/garage" },
  { icon: Compass, title: "Component registry", body: "Structured specs and compatibility attributes with explicit provenance — verified, community or demo.", href: "/components" },
  { icon: History, title: "Immutable build history", body: "Each confirmed configuration change becomes a revision. Inspect any previous build.", href: "/garage" },
  { icon: Wrench, title: "Maintenance & analytics", body: "Service log, reminders and cost summaries. Weight, gearing and value from recorded data only.", href: "/garage" },
  { icon: Fingerprint, title: "Digital Bike Passport", body: "A shareable public page per bicycle, with owner-controlled fields and community engagement.", href: "/explore" },
];

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const [session, preview] = await Promise.all([
    getSession(),
    supabase ? explorePublicBikes(supabase, { sort: "recent", page: 1 }, 4).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto grid grid-cols-1 max-w-[1440px] items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-14">
          <div className="flex flex-col gap-5">
            <span className="eyebrow">VELOX Digital Garage</span>
            <h1 className="max-w-xl text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
              The digital twin of your bicycle.
            </h1>
            <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground">
              Every bicycle has a digital identity. Every component has a record. Every modification has a history. Build yours in 3D, track it over time, and share it with a passport.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="primary" size="lg">
                <Link href={session ? "/garage" : "/register"}>{session ? "Open your garage" : "Create your garage"} <ArrowRight /></Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/explore">Explore builds</Link>
              </Button>
            </div>
            <dl className="mt-4 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-4 text-xs">
              <div><dt className="eyebrow">Compatibility</dt><dd className="mt-1 text-muted-foreground">{RULES.length} structured rules</dd></div>
              <div><dt className="eyebrow">History</dt><dd className="mt-1 text-muted-foreground">Immutable revisions</dd></div>
              <div><dt className="eyebrow">Privacy</dt><dd className="mt-1 text-muted-foreground">Owner-controlled</dd></div>
            </dl>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <HeroViewer />
            <p className="text-xs text-subtle-foreground">Drag to orbit · scroll to zoom · click a part to identify it. Shown: VELOX procedural placeholder model.</p>
          </div>
        </div>
      </section>

      <Container wide className="py-12">
        <SectionTitle>What VELOX does</SectionTitle>
        <ul className="grid grid-cols-1 gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body, href }) => (
            <li key={title} className="bg-background">
              <Link href={href} className="flex h-full flex-col gap-2 p-5 transition-colors hover:bg-surface">
                <Icon className="size-4 text-accent" />
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      <Container wide className="pb-12">
        <SectionTitle action={<Link href="/explore" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All public builds <ArrowRight className="size-3" /></Link>}>
          From the community
        </SectionTitle>
        {preview && preview.items.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {preview.items.map((b) => (
              <BikeCard key={b.id} data={{ href: `/bike/${b.owner_username}/${b.slug}`, name: b.name!, brand: b.brand, model: b.model, category: b.category, coverUrl: b.coverUrl, colorHex: b.color_hex, meta: <span>@{b.owner_username}</span> }} />
            ))}
          </div>
        ) : (
          <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
            No public builds yet. Public Digital Bike Passports from riders will appear here — VELOX does not show placeholder community content.
          </p>
        )}
      </Container>

      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">Give your bicycle a digital identity.</h2>
            <p className="text-sm text-muted-foreground">Free to start. Private by default — you decide what becomes public.</p>
          </div>
          <Button asChild variant="primary" size="lg">
            <Link href={session ? "/garage/new" : "/register"}>{session ? "Add a bicycle" : "Get started"} <ArrowRight /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}
