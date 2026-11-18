"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/common/form";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/server/actions/auth";
import { applyServerErrors } from "@/lib/forms";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setError(null);
      const res = await signIn(values, next);
      if (res && !res.ok) setError(res.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormMessage kind="error">{error}</FormMessage>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm<z.input<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", username: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setError(null);
      const res = await signUp(values);
      if (!res) return;
      if (!res.ok) {
        setError(res.error);
        applyServerErrors(res, form.setError);
      } else setDone(res.message ?? "Account created.");
    }),
  );

  if (done) return <FormMessage kind="success">{done}</FormMessage>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormMessage kind="error">{error}</FormMessage>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field label="Username" htmlFor="username" error={errors.username?.message} hint="Public. Used in your bike passport URLs.">
        <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...form.register("username")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters with letters and numbers.">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await requestPasswordReset(values);
      setMessage(res.ok ? { kind: "success", text: res.message ?? "Check your inbox." } : { kind: "error", text: res.error });
    }),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const form = useForm<z.input<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await updatePassword(values);
      if (res.ok) {
        setMessage({ kind: "success", text: "Password updated. Redirecting…" });
        setTimeout(() => router.push("/dashboard"), 900);
      } else setMessage({ kind: "error", text: res.error });
    }),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      <Field label="New password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
