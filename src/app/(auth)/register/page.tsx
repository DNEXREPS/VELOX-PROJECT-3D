import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { RegisterForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Create your garage" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your garage"
      description="Register bicycles, track components and maintenance, and publish Digital Bike Passports."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
