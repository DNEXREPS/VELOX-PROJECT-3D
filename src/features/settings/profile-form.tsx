"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/common/avatar";
import { Field, FormMessage } from "@/components/common/form";
import { profileSchema, AVATAR_MAX_BYTES } from "@/lib/validation/schemas";
import { removeAvatar, updateProfile, uploadAvatar } from "@/server/actions/profile";
import { applyServerErrors } from "@/lib/forms";

type Values = z.input<typeof profileSchema>;

export function ProfileForm({ defaults }: { defaults: Values }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const res = await updateProfile(v);
          if (!res.ok) {
            setMsg({ kind: "error", text: res.error });
            applyServerErrors(res, form.setError);
          } else {
            setMsg({ kind: "success", text: res.message ?? "Saved." });
            router.refresh();
          }
        }),
      )}
    >
      {msg && <div className="sm:col-span-2"><FormMessage kind={msg.kind}>{msg.text}</FormMessage></div>}
      <Field label="Username" htmlFor="s-username" error={errors.username?.message} hint="Changing it changes your profile and passport URLs.">
        <Input id="s-username" autoCapitalize="none" spellCheck={false} {...form.register("username")} />
      </Field>
      <Field label="Display name" htmlFor="s-display" error={errors.display_name?.message} optional>
        <Input id="s-display" {...form.register("display_name")} />
      </Field>
      <Field label="Location" htmlFor="s-location" error={errors.location?.message} optional>
        <Input id="s-location" {...form.register("location")} />
      </Field>
      <Field label="Website" htmlFor="s-web" error={errors.website_url?.message} optional>
        <Input id="s-web" type="url" placeholder="https://" {...form.register("website_url")} />
      </Field>
      <Field label="Bio" htmlFor="s-bio" error={errors.bio?.message} optional className="sm:col-span-2">
        <Textarea id="s-bio" rows={3} maxLength={500} {...form.register("bio")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}

export function AvatarForm({ url, name }: { url: string | null; name: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-4">
      <Avatar url={url} name={name} size={64} />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => ref.current?.click()}>{pending ? "Uploading…" : "Upload avatar"}</Button>
          {url && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await removeAvatar(); router.refresh(); })}>Remove</Button>}
        </div>
        <span className="text-xs text-muted-foreground">JPEG, PNG or WebP · max 2 MB</span>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > AVATAR_MAX_BYTES) return setError("Avatar must be 2 MB or smaller.");
          const fd = new FormData();
          fd.set("file", file);
          start(async () => {
            const res = await uploadAvatar(fd);
            setError(res.ok ? null : res.error);
            e.target.value = "";
            router.refresh();
          });
        }}
      />
    </div>
  );
}
