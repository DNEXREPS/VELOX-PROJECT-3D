import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Warehouse } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader, SectionTitle } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Stat } from "@/components/common/data-value";
import { Button } from "@/components/ui/button";
import { BikeCard } from "@/features/garage/bike-card";
import { VisibilityBadge } from "@/features/garage/garage-browser";
import { RevisionList } from "@/features/history/revision-list";
import { ReminderList } from "@/features/maintenance/reminder-list";
import { requireSession } from "@/server/auth";
import { getDashboard } from "@/server/queries/garage";
import { computeReminders } from "@/lib/maintenance";
import { formatKg, relativeTime, todayIso } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const { bikes, recent, upcoming, activity } = await getDashboard(session);
  const reminders = computeReminders(upcoming, todayIso());
  const overdue = reminders.filter((r) => r.status === "overdue").length;
  const name = session.profile.display_name ?? session.profile.username;

  return (
    <Container wide>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${name}`}
        description="Your bicycles, their upkeep and recent changes at a glance."
        actions={
          <Button asChild variant="primary">
            <Link href="/garage/new"><Plus /> Add bicycle</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-6 border-b border-border py-5 sm:grid-cols-4">
        <Stat label="Bicycles" value={bikes.length} />
        <Stat label="Public passports" value={bikes.filter((b) => b.visibility === "public").length} />
        <Stat label="Open reminders" value={reminders.length} hint={overdue ? <span className="text-danger">{overdue} overdue</span> : undefined} />
        <Stat label="Build revisions (recent)" value={activity.length} />
      </div>

      {bikes.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Warehouse />}
          title="Start your digital garage"
          description="Add a bicycle, record its components in the 3D Studio and every change becomes part of its history."
          action={
            <Button asChild variant="primary">
              <Link href="/garage/new"><Plus /> Add your first bicycle</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-8">
            <section>
              <SectionTitle action={<Link href="/garage" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All bicycles <ArrowRight className="size-3" /></Link>}>
                Collection
              </SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {bikes.slice(0, 6).map((b) => (
                  <BikeCard
                    key={b.id}
                    data={{
                      href: `/garage/${b.id}`, name: b.name, brand: b.brand, model: b.model, category: b.category,
                      coverUrl: b.coverUrl, colorHex: b.color_hex, isPrimary: b.is_primary,
                      badges: <VisibilityBadge v={b.visibility} />,
                      meta: <span className="figure">{b.componentCount} parts · {b.weight_kg ? formatKg(b.weight_kg) : "weight —"}</span>,
                    }}
                  />
                ))}
              </div>
            </section>

            {recent.length > 0 && (
              <section>
                <SectionTitle>Recently accessed</SectionTitle>
                <ul className="divide-y divide-border border-y border-border">
                  {recent.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link href={`/garage/${b.id}`} className="truncate hover:text-accent">{b.name}</Link>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <Link href={`/garage/${b.id}/studio`} className="hover:text-foreground">Studio</Link>
                        <span>{relativeTime(b.last_accessed_at!)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-8">
            <section>
              <SectionTitle>Maintenance reminders</SectionTitle>
              {reminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming maintenance. Set a “next due” date when recording service work to get reminders here.</p>
              ) : (
                <ReminderList reminders={reminders.slice(0, 8)} linkBase={(r) => `/garage/${r.bicycle_id}/maintenance`} />
              )}
            </section>
            <section>
              <SectionTitle>Recent build activity</SectionTitle>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No configuration changes yet. Open a bicycle’s 3D Studio to record its components.</p>
              ) : (
                <RevisionList revisions={activity.map((a) => ({ ...a, href: `/garage/${a.bicycle_id}/history` }))} max={5} />
              )}
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
