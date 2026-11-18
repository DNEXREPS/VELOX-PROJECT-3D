import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader, SectionTitle } from "@/components/common/page-header";
import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { AvatarForm, ProfileForm } from "@/features/settings/profile-form";
import { requireSession } from "@/server/auth";
import { avatarUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile, email } = await requireSession("/settings");
  return (
    <Container className="max-w-3xl">
      <PageHeader title="Settings" description="Your public profile and account." />
      <section className="flex flex-col gap-5 border-b border-border py-6">
        <SectionTitle>Public profile</SectionTitle>
        <AvatarForm url={avatarUrl(profile.avatar_path)} name={profile.display_name ?? profile.username} />
        <ProfileForm
          defaults={{
            username: profile.username,
            display_name: profile.display_name ?? "",
            bio: profile.bio ?? "",
            location: profile.location ?? "",
            website_url: profile.website_url ?? "",
          }}
        />
      </section>
      <section className="flex flex-col gap-4 py-6">
        <SectionTitle>Account</SectionTitle>
        <p className="text-sm text-muted-foreground">Signed in as <span className="text-foreground">{email}</span></p>
        <div className="max-w-sm">
          <h3 className="mb-3 text-sm font-medium">Change password</h3>
          <ResetPasswordForm />
        </div>
      </section>
    </Container>
  );
}
