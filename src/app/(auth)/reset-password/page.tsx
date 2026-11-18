import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { ResetPasswordForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the password-reset email via /auth/callback (which establishes the session). */
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" description="Enter a new password for your account.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
