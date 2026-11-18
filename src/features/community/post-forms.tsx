"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/common/form";
import { postSchema } from "@/lib/validation/schemas";
import { addComment, createPost } from "@/server/actions/community";

export function NewPostForm({ bikes }: { bikes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof postSchema>>({ resolver: zodResolver(postSchema), defaultValues: { title: "", body: "", bicycle_id: "" } });
  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          setError(null);
          const res = await createPost(values);
          if (!res.ok) return setError(res.error);
          form.reset();
          router.push(`/community/${res.data.id}`);
        }),
      )}
    >
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field label="Title" htmlFor="p-title" error={errors.title?.message}>
        <Input id="p-title" maxLength={140} placeholder="Share a build, an upgrade or a question" {...form.register("title")} />
      </Field>
      <Field label="Linked bicycle" htmlFor="p-bike" optional hint="Only your public bicycles can be linked — the post links to its Digital Bike Passport.">
        <NativeSelect id="p-bike" {...form.register("bicycle_id")}>
          <option value="">No bicycle</option>
          {bikes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Text" htmlFor="p-body" error={errors.body?.message} optional>
        <Textarea id="p-body" rows={5} maxLength={10000} {...form.register("body")} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Publishing…" : "Publish"}</Button>
      </div>
    </form>
  );
}

export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await addComment({ postId, body });
          if (!res.ok) return setError(res.fieldErrors?.body?.[0] ?? res.error);
          setBody("");
          router.refresh();
        });
      }}
    >
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" rows={3} maxLength={2000} aria-label="Comment" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="primary" disabled={pending || !body.trim()}>{pending ? "Posting…" : "Comment"}</Button>
      </div>
    </form>
  );
}
