import { isSupabaseConfigured } from "@/lib/env";
import { BackendNotice } from "@/components/common/backend-notice";
import { Container } from "@/components/layout/container";
import { requireSession } from "@/server/auth";

/** Authenticated area. The proxy redirects anonymous users; this re-checks server-side. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <Container>
        <BackendNotice />
      </Container>
    );
  }
  await requireSession();
  return <>{children}</>;
}
