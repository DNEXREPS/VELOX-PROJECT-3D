"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FormMessage } from "@/components/common/form";
import { applyConfiguration } from "@/server/actions/configuration";
import { CURRENCIES } from "@/lib/domain/bicycle";
import { SLOT_META, type BikeSlot } from "@/lib/domain/slots";

export interface EditablePart {
  slot: BikeSlot;
  name: string;
  componentId: string | null;
  custom: boolean;
  pricePaid: number | null;
  currency: string | null;
  installedOn: string | null;
  notes: string | null;
}

/** Edit purchase details / remove — each save is recorded as a build revision. */
export function PartActions({ bikeId, part }: { bikeId: string; part: EditablePart }) {
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "remove" | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState(part.pricePaid?.toString() ?? "");
  const [currency, setCurrency] = useState(part.currency ?? "EUR");
  const [installedOn, setInstalledOn] = useState(part.installedOn ?? "");
  const [notes, setNotes] = useState(part.notes ?? "");
  const [description, setDescription] = useState("");

  const submit = (change: Record<string, unknown>, desc: string) =>
    start(async () => {
      setError(null);
      const res = await applyConfiguration({ bicycleId: bikeId, description: desc || undefined, changes: [{ slot: part.slot, ...change }] });
      if (!res.ok) return setError(res.error);
      setOpen(null);
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${SLOT_META[part.slot].label}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("edit")}><Pencil /> Edit details</DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/garage/${bikeId}/studio?slot=${part.slot}`}><RefreshCw /> Replace in Studio</Link>
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setOpen("remove")}><Trash2 /> Remove from build</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={(o) => setOpen(o ? "edit" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{SLOT_META[part.slot].label}: {part.name}</DialogTitle>
            <DialogDescription>Purchase and installation details you entered. Saved as a new build revision.</DialogDescription>
          </DialogHeader>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label="Price paid" htmlFor="pp" optional>
              <Input id="pp" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Currency" htmlFor="pc">
              <NativeSelect id="pc" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Installed on" htmlFor="io" optional>
            <Input id="io" type="date" value={installedOn} onChange={(e) => setInstalledOn(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="pn" optional>
            <Textarea id="pn" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label="Change description" htmlFor="cd" optional>
            <Input id="cd" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Added receipt price" />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                const n = price.trim() === "" ? null : Number(price);
                if (n !== null && (!Number.isFinite(n) || n < 0)) return setError("Price must be a positive number.");
                submit(
                  {
                    component_id: part.componentId,
                    custom_name: part.custom ? part.name : null,
                    price_paid: n,
                    currency: n === null ? null : currency,
                    installed_on: installedOn || null,
                    notes: notes.trim() || null,
                  },
                  description,
                );
              }}
            >
              {pending ? "Saving…" : "Save revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "remove"} onOpenChange={(o) => setOpen(o ? "remove" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {part.name}?</DialogTitle>
            <DialogDescription>The {SLOT_META[part.slot].label.toLowerCase()} will be removed from the current build. The previous configuration stays in the build history.</DialogDescription>
          </DialogHeader>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <Input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={() => submit({ remove: true }, description)}>
              {pending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
