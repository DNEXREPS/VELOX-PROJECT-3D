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
import { componentSubmissionSchema } from "@/lib/validation/schemas";
import { CURRENCIES } from "@/lib/domain/bicycle";
import { submitComponent } from "@/server/actions/components";
import { applyServerErrors } from "@/lib/forms";

type Values = z.input<typeof componentSubmissionSchema>;

export function SubmitComponentDialog({ brands, categories, defaultOpen = false }: { brands: { id: string; name: string }[]; categories: { id: string; name: string }[]; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(componentSubmissionSchema), defaultValues: { name: "", brand_id: "", category_id: "", currency: "EUR" } });
  const { errors } = form.formState;
  const r = form.register;
  const e = (k: keyof Values) => errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm"><Plus /> Submit component</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit a component</DialogTitle>
          <DialogDescription>Added as “Unverified” until a moderator reviews it. Enter only data you can source — leave unknown values empty.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((values) =>
            start(async () => {
              setError(null);
              const res = await submitComponent(values);
              if (!res.ok) {
                setError(res.error);
                applyServerErrors(res, form.setError);
                return;
              }
              setOpen(false);
              router.push(`/components/${res.data.slug}`);
            }),
          )}
        >
          {error && <div className="sm:col-span-2"><FormMessage kind="error">{error}</FormMessage></div>}
          <Field label="Product name" htmlFor="c-name" error={e("name")} className="sm:col-span-2">
            <Input id="c-name" {...r("name")} />
          </Field>
          <Field label="Brand" htmlFor="c-brand" error={e("brand_id")}>
            <NativeSelect id="c-brand" {...r("brand_id")}>
              <option value="">Select…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Category" htmlFor="c-cat" error={e("category_id")}>
            <NativeSelect id="c-cat" {...r("category_id")}>
              <option value="">Select…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Model / code" htmlFor="c-model" error={e("model")} optional><Input id="c-model" {...r("model")} /></Field>
          <Field label="Manufacturer reference" htmlFor="c-mref" error={e("manufacturer_ref")} optional><Input id="c-mref" {...r("manufacturer_ref")} /></Field>
          <Field label="Weight (g)" htmlFor="c-weight" error={e("weight_g")} optional><Input id="c-weight" inputMode="decimal" {...r("weight_g")} /></Field>
          <Field label="Material" htmlFor="c-mat" error={e("material")} optional><Input id="c-mat" {...r("material")} /></Field>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label="Reference price" htmlFor="c-price" error={e("price_reference")} optional><Input id="c-price" inputMode="decimal" {...r("price_reference")} /></Field>
            <Field label="Currency" htmlFor="c-cur" error={e("currency")}>
              <NativeSelect id="c-cur" {...r("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
            </Field>
          </div>
          <Field label="Source URL" htmlFor="c-src" error={e("source_url")} optional hint="Where the data comes from (manufacturer page)."><Input id="c-src" type="url" {...r("source_url")} /></Field>
          <Field label="Description" htmlFor="c-desc" error={e("description")} optional className="sm:col-span-2"><Textarea id="c-desc" rows={3} {...r("description")} /></Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Submitting…" : "Submit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteComponentButton({ componentId }: { componentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          confirm("Delete your submission?") &&
          start(async () => {
            const { deleteComponent } = await import("@/server/actions/components");
            const res = await deleteComponent(componentId);
            if (!res.ok) return setError(res.error);
            router.push("/components");
          })
        }
      >
        Delete submission
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
