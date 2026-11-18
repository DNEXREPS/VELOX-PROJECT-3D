import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { SectionTitle } from "@/components/common/page-header";
import { SpecTable } from "@/components/common/data-value";
import { ProvenanceBadge } from "@/components/common/provenance";
import { OverviewViewer } from "@/features/garage/overview-viewer";
import { GalleryManager } from "@/features/garage/gallery-manager";
import { PassportSettings } from "@/features/garage/passport-settings";
import { RevisionList } from "@/features/history/revision-list";
import { ReminderList } from "@/features/maintenance/reminder-list";
import { loadOwnedBike } from "@/server/bike-context";
import { getConfiguration, getMaintenance, getRevisions } from "@/server/queries/garage";
import { componentWeight } from "@/lib/analytics";
import { computeReminders } from "@/lib/maintenance";
import { CATEGORY_LABEL, MATERIAL_LABEL } from "@/lib/domain/bicycle";
import { SLOT_GROUPS, SLOT_META } from "@/lib/domain/slots";
import { formatDate, formatKg, formatMoney, formatWeight, todayIso } from "@/lib/format";

export default async function BikeOverviewPage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { session, bike, privateDetails, images } = await loadOwnedBike(bikeId);
  const [parts, revisions, maintenance] = await Promise.all([getConfiguration(session, bikeId), getRevisions(session, bikeId, 3), getMaintenance(session, bikeId)]);
  const weight = componentWeight(parts);
  const reminders = computeReminders(maintenance, todayIso());
  const lastService = maintenance[0];

  return (
    <div className="mx-auto grid grid-cols-1 max-w-[1440px] gap-8 px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-8">
        <OverviewViewer
          bikeId={bike.id}
          modelKey={bike.model_key}
          paintColor={bike.color_hex}
          parts={parts.map((p) => ({
            slot: p.slot,
            name: p.name,
            brand: p.brand,
            weightG: p.weightG,
            tireWidth: typeof p.attributes.tire_width_mm === "number" ? p.attributes.tire_width_mm : undefined,
          }))}
        />

        <section>
          <SectionTitle action={<Link href={`/garage/${bike.id}/components`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Manage <ArrowRight className="size-3" /></Link>}>
            Components <span className="figure ml-1 text-xs font-normal text-muted-foreground">{parts.length}</span>
          </SectionTitle>
          {parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No components recorded yet.{" "}
              <Link href={`/garage/${bike.id}/studio`} className="text-accent hover:underline">Open the 3D Studio</Link> to build the configuration.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {SLOT_GROUPS.map((g) => {
                const groupParts = parts.filter((p) => SLOT_META[p.slot].group === g.id);
                if (!groupParts.length) return null;
                return (
                  <div key={g.id} className="min-w-0">
                    <h3 className="eyebrow mb-1">{g.label}</h3>
                    <ul className="divide-y divide-border border-y border-border text-sm">
                      {groupParts.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="w-28 shrink-0 text-xs text-muted-foreground">{SLOT_META[p.slot].label}</span>
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="figure shrink-0 text-xs text-muted-foreground">{p.weightG ? formatWeight(p.weightG) : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Photos</SectionTitle>
          <GalleryManager bikeId={bike.id} images={images} coverPath={bike.cover_image_path} />
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-8">
        <section>
          <SectionTitle>Specification</SectionTitle>
          <SpecTable
            items={[
              { label: "Category", value: CATEGORY_LABEL[bike.category] },
              { label: "Brand", value: bike.brand },
              { label: "Model", value: bike.model },
              { label: "Model year", value: bike.model_year },
              { label: "Frame material", value: bike.frame_material ? MATERIAL_LABEL[bike.frame_material] : null },
              { label: "Frame size", value: bike.frame_size },
              { label: "Colour", value: bike.color },
              { label: "Measured weight", value: bike.weight_kg ? formatKg(bike.weight_kg) : null, hint: bike.weight_kg ? <ProvenanceBadge kind="user" /> : undefined },
              {
                label: "Component weight",
                value: weight.value !== null ? formatWeight(weight.value) : null,
                hint: weight.value !== null ? <span className="text-xs text-muted-foreground">{weight.complete ? "" : `${weight.known}/${weight.total} known · `}<ProvenanceBadge kind="calculated" /></span> : undefined,
              },
              { label: "Estimated value", value: bike.estimated_value ? formatMoney(bike.estimated_value, bike.value_currency) : null, hint: bike.estimated_value ? <ProvenanceBadge kind="user" /> : undefined },
            ]}
          />
          {bike.description && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{bike.description}</p>}
        </section>

        <section>
          <SectionTitle>
            <span className="flex items-center gap-1.5"><Lock className="size-3.5 text-muted-foreground" /> Private details</span>
          </SectionTitle>
          <SpecTable
            items={[
              { label: "Serial number", value: privateDetails?.serial_number },
              { label: "Purchase price", value: privateDetails?.purchase_price ? formatMoney(privateDetails.purchase_price, privateDetails.purchase_currency) : null },
              { label: "Purchase date", value: privateDetails?.purchase_date ? formatDate(privateDetails.purchase_date) : null },
            ]}
          />
        </section>

        <section>
          <SectionTitle action={<Link href={`/garage/${bike.id}/maintenance`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Log <ArrowRight className="size-3" /></Link>}>
            Maintenance status
          </SectionTitle>
          <p className="mb-2 text-xs text-muted-foreground">
            {lastService ? `Last service: ${lastService.title} on ${formatDate(lastService.performed_on)}` : "No maintenance recorded."}
          </p>
          {reminders.length > 0 && <ReminderList reminders={reminders.slice(0, 4)} />}
        </section>

        <section>
          <SectionTitle action={<Link href={`/garage/${bike.id}/history`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Full history <ArrowRight className="size-3" /></Link>}>
            Build history
          </SectionTitle>
          {revisions.length ? <RevisionList revisions={revisions} max={3} /> : <p className="text-sm text-muted-foreground">No revisions yet.</p>}
        </section>

        <section>
          <SectionTitle>Digital Bike Passport</SectionTitle>
          <PassportSettings
            bikeId={bike.id}
            passportUrl={`/bike/${session.profile.username}/${bike.slug}`}
            initial={{
              visibility: bike.visibility,
              passport_show_weight: bike.passport_show_weight,
              passport_show_value: bike.passport_show_value,
              passport_show_components: bike.passport_show_components,
              passport_show_history: bike.passport_show_history,
              passport_show_maintenance: bike.passport_show_maintenance,
            }}
          />
        </section>
      </aside>
    </div>
  );
}
