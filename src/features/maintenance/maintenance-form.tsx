"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/common/form";
import { maintenanceSchema } from "@/lib/validation/schemas";
import { CURRENCIES, MAINTENANCE_TYPES, MAINTENANCE_TYPE_LABEL } from "@/lib/domain/bicycle";
import { BIKE_SLOTS, SLOT_META } from "@/lib/domain/slots";
import { createMaintenance, updateMaintenance } from "@/server/actions/maintenance";
import { applyServerErrors } from "@/lib/forms";
import { todayIso } from "@/lib/format";

type Values = z.input<typeof maintenanceSchema>;

export function MaintenanceDialog({
  bikeId,
  recordId,
  defaults,
  trigger,
}: {
  bikeId: string;
  recordId?: string;
  defaults?: Partial<Record<keyof Values, string>>;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: { maintenance_type: "inspection", title: "", performed_on: todayIso(), currency: "EUR", ...(defaults as Partial<Values>) },
  });
  const { errors } = form.formState;
  const r = form.register;
  const e = (k: keyof Values) => errors[k]?.message as string | undefined;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setError(null);
      const res = recordId ? await updateMaintenance(recordId, values) : await createMaintenance(bikeId, values);
      if (!res.ok) {
        setError(res.error);
        applyServerErrors(res, form.setError);
        return;
      }
      setOpen(false);
      if (!recordId) form.reset();
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button variant="primary" size="sm"><Plus /> Log maintenance</Button>}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{recordId ? "Edit maintenance record" : "Log maintenance"}</DialogTitle>
          <DialogDescription>Record what was actually done. Leave distance and cost empty if you don’t know them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          {error && <div className="sm:col-span-2"><FormMessage kind="error">{error}</FormMessage></div>}
          <Field label="Title" htmlFor="m-title" error={e("title")} className="sm:col-span-2">
            <Input id="m-title" placeholder="e.g. New chain and cassette" {...r("title")} />
          </Field>
          <Field label="Type" htmlFor="m-type" error={e("maintenance_type")}>
            <NativeSelect id="m-type" {...r("maintenance_type")}>
              {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{MAINTENANCE_TYPE_LABEL[t]}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Component" htmlFor="m-slot" error={e("slot")} optional>
            <NativeSelect id="m-slot" {...r("slot")}>
              <option value="">Whole bicycle</option>
              {BIKE_SLOTS.map((s) => <option key={s} value={s}>{SLOT_META[s].label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Date performed" htmlFor="m-date" error={e("performed_on")}>
            <Input id="m-date" type="date" max={todayIso()} {...r("performed_on")} />
          </Field>
          <Field label="Odometer (km)" htmlFor="m-dist" error={e("distance_km")} optional>
            <Input id="m-dist" inputMode="decimal" {...r("distance_km")} />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label="Cost" htmlFor="m-cost" error={e("cost")} optional>
              <Input id="m-cost" inputMode="decimal" {...r("cost")} />
            </Field>
            <Field label="Currency" htmlFor="m-cur" error={e("currency")}>
              <NativeSelect id="m-cur" {...r("currency")}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Next due date" htmlFor="m-next" error={e("next_due_on")} optional>
            <Input id="m-next" type="date" {...r("next_due_on")} />
          </Field>
          <Field label="Next due at (km)" htmlFor="m-nextkm" error={e("next_due_distance_km")} optional>
            <Input id="m-nextkm" inputMode="decimal" {...r("next_due_distance_km")} />
          </Field>
          <Field label="Notes" htmlFor="m-notes" error={e("notes")} optional className="sm:col-span-2" hint="Private — never shown on the passport.">
            <Textarea id="m-notes" rows={3} {...r("notes")} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save record"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
