"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/common/form";
import { updatePassportSettings } from "@/server/actions/bicycles";

type Settings = {
  visibility: "private" | "public";
  passport_show_weight: boolean;
  passport_show_value: boolean;
  passport_show_components: boolean;
  passport_show_history: boolean;
  passport_show_maintenance: boolean;
};

const TOGGLES: { key: Exclude<keyof Settings, "visibility">; label: string; hint: string }[] = [
  { key: "passport_show_components", label: "Component list", hint: "Installed parts and their catalogue data." },
  { key: "passport_show_weight", label: "Measured weight", hint: "The weight you entered for the bicycle." },
  { key: "passport_show_value", label: "Value & prices", hint: "Estimated value, prices paid and service costs." },
  { key: "passport_show_history", label: "Build history", hint: "Configuration revisions (descriptions and part changes)." },
  { key: "passport_show_maintenance", label: "Maintenance log", hint: "Dates, types and distances — never your notes." },
];

export function PassportSettings({ bikeId, initial, passportUrl }: { bikeId: string; initial: Settings; passportUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  return (
    <div className="flex flex-col gap-3">
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <label className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <span>
          <span className="block text-sm font-medium">Public passport</span>
          <span className="text-xs text-muted-foreground">Listed in Explore with a shareable URL. Serial number and purchase data are never public.</span>
        </span>
        <Switch checked={s.visibility === "public"} onCheckedChange={(v) => setS({ ...s, visibility: v ? "public" : "private" })} aria-label="Public passport" />
      </label>
      <fieldset disabled={s.visibility !== "public"} className="flex flex-col gap-2.5 disabled:opacity-50">
        <legend className="eyebrow mb-1">Visible on the passport</legend>
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </span>
            <Switch checked={s[t.key]} onCheckedChange={(v) => setS({ ...s, [t.key]: v })} aria-label={t.label} disabled={s.visibility !== "public"} />
          </label>
        ))}
      </fieldset>
      <div className="flex items-center justify-between gap-2 pt-1">
        {initial.visibility === "public" ? (
          <Link href={passportUrl} target="_blank" className="flex items-center gap-1 text-xs text-accent hover:underline">
            View passport <ExternalLink className="size-3" />
          </Link>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await updatePassportSettings(bikeId, s);
              setMsg(res.ok ? { kind: "success", text: res.message ?? "Saved." } : { kind: "error", text: res.error });
              if (res.ok) router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
