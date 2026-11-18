"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldGroup, FormMessage } from "@/components/common/form";
import { bicycleSchema } from "@/lib/validation/schemas";
import { BICYCLE_CATEGORIES, CATEGORY_LABEL, CURRENCIES, FRAME_MATERIALS, MATERIAL_LABEL } from "@/lib/domain/bicycle";
import { createBicycle, updateBicycle } from "@/server/actions/bicycles";
import { applyServerErrors } from "@/lib/forms";

type FormValues = z.input<typeof bicycleSchema>;

export function BicycleForm({ bikeId, defaults }: { bikeId?: string; defaults?: Partial<Record<keyof FormValues, string | boolean>> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(bicycleSchema),
    defaultValues: {
      name: "",
      category: "road",
      value_currency: "EUR",
      purchase_currency: "EUR",
      visibility: "private",
      is_primary: false,
      ...(defaults as Partial<FormValues>),
    },
  });
  const { errors } = form.formState;
  const r = form.register;
  const colorHex = useWatch({ control: form.control, name: "color_hex" }) as string | undefined;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setMessage(null);
      const res = bikeId ? await updateBicycle(bikeId, values) : await createBicycle(values);
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        applyServerErrors(res, form.setError);
        return;
      }
      if (!bikeId && res.data && typeof res.data === "object" && "id" in res.data) {
        router.push(`/garage/${(res.data as { id: string }).id}`);
      } else {
        setMessage({ kind: "success", text: res.message ?? "Saved." });
        router.refresh();
      }
    }),
  );

  const err = (k: keyof FormValues) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

      <FieldGroup title="Identity" description="How the bicycle is identified in your garage and on its passport.">
        <Field label="Name" htmlFor="name" error={err("name")} className="sm:col-span-2">
          <Input id="name" placeholder="e.g. Winter Gravel" aria-invalid={!!errors.name} {...r("name")} />
        </Field>
        <Field label="Brand" htmlFor="brand" error={err("brand")} optional>
          <Input id="brand" {...r("brand")} />
        </Field>
        <Field label="Model" htmlFor="model" error={err("model")} optional>
          <Input id="model" {...r("model")} />
        </Field>
        <Field label="Category" htmlFor="category" error={err("category")}>
          <NativeSelect id="category" {...r("category")}>
            {BICYCLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Model year" htmlFor="model_year" error={err("model_year")} optional>
          <Input id="model_year" inputMode="numeric" {...r("model_year")} />
        </Field>
        <Field label="Frame material" htmlFor="frame_material" error={err("frame_material")} optional>
          <NativeSelect id="frame_material" {...r("frame_material")}>
            <option value="">Not specified</option>
            {FRAME_MATERIALS.map((m) => (
              <option key={m} value={m}>{MATERIAL_LABEL[m]}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Frame size" htmlFor="frame_size" error={err("frame_size")} optional hint="As labelled by the manufacturer, e.g. 56 or M.">
          <Input id="frame_size" {...r("frame_size")} />
        </Field>
        <Field label="Colour name" htmlFor="color" error={err("color")} optional>
          <Input id="color" placeholder="e.g. Satin graphite" {...r("color")} />
        </Field>
        <Field label="Colour (3D paint)" htmlFor="color_hex" error={err("color_hex")} optional hint="Applied to the frame in the 3D studio.">
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Pick colour"
              value={colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : "#2b3038"}
              onChange={(e) => form.setValue("color_hex", e.target.value, { shouldDirty: true })}
              className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-surface-sunken p-1"
            />
            <Input id="color_hex" placeholder="#2b3038" {...r("color_hex")} />
          </div>
        </Field>
      </FieldGroup>

      <FieldGroup title="Specification & value" description="Weight and value as you measured or estimated them. Leave blank if unknown — VELOX never guesses.">
        <Field label="Measured weight (kg)" htmlFor="weight_kg" error={err("weight_kg")} optional>
          <Input id="weight_kg" inputMode="decimal" {...r("weight_kg")} />
        </Field>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label="Estimated value" htmlFor="estimated_value" error={err("estimated_value")} optional>
            <Input id="estimated_value" inputMode="decimal" {...r("estimated_value")} />
          </Field>
          <Field label="Currency" htmlFor="value_currency" error={err("value_currency")}>
            <NativeSelect id="value_currency" {...r("value_currency")}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Description" htmlFor="description" error={err("description")} optional className="sm:col-span-2">
          <Textarea id="description" rows={4} {...r("description")} />
        </Field>
      </FieldGroup>

      <FieldGroup title="Visibility" description="Public bicycles get a shareable Digital Bike Passport. You control which fields appear on it.">
        <Field label="Visibility" htmlFor="visibility" error={err("visibility")}>
          <NativeSelect id="visibility" {...r("visibility")}>
            <option value="private">Private — only you</option>
            <option value="public">Public — passport &amp; explore</option>
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" {...r("is_primary")} />
          Primary bicycle
        </label>
      </FieldGroup>

      <FieldGroup title="Private details" description="Never shown publicly, including on the passport. Stored in an owner-only table.">
        <div className="sm:col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> Visible only to you
        </div>
        <Field label="Serial number" htmlFor="serial_number" error={err("serial_number")} optional>
          <Input id="serial_number" autoComplete="off" spellCheck={false} {...r("serial_number")} />
        </Field>
        <Field label="Purchase date" htmlFor="purchase_date" error={err("purchase_date")} optional>
          <Input id="purchase_date" type="date" {...r("purchase_date")} />
        </Field>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label="Purchase price" htmlFor="purchase_price" error={err("purchase_price")} optional>
            <Input id="purchase_price" inputMode="decimal" {...r("purchase_price")} />
          </Field>
          <Field label="Currency" htmlFor="purchase_currency" error={err("purchase_currency")}>
            <NativeSelect id="purchase_currency" {...r("purchase_currency")}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </NativeSelect>
          </Field>
        </div>
      </FieldGroup>

      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : bikeId ? "Save changes" : "Create bicycle"}
        </Button>
      </div>
    </form>
  );
}
