import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/auth-forms";
import { safeRedirectPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthShell
      title="Sign in"
      description="Access your digital garage."
      footer={
        <>
          New to VELOX?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Create your garage
          </Link>
        </>
      }
    >
      {error === "callback" && <p className="text-sm text-danger">That link is invalid or has expired. Please sign in or request a new link.</p>}
      <LoginForm next={safeRedirectPath(next)} />
    </AuthShell>
  );
}
