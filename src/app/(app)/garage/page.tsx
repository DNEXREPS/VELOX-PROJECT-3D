import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Warehouse } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { GarageBrowser } from "@/features/garage/garage-browser";
import { requireSession } from "@/server/auth";
import { listMyBicycles } from "@/server/queries/garage";

export const metadata: Metadata = { title: "Garage" };

export default async function GaragePage() {
  const session = await requireSession("/garage");
  const bikes = await listMyBicycles(session);
  const addButton = (
    <Button asChild variant="primary">
      <Link href="/garage/new"><Plus /> Add bicycle</Link>
    </Button>
  );
  return (
    <Container wide>
      <PageHeader
        title="Garage"
        description={`${bikes.length} ${bikes.length === 1 ? "bicycle" : "bicycles"} · ${bikes.filter((b) => b.visibility === "public").length} public`}
        actions={addButton}
      />
      <div className="pt-6">
        {bikes.length === 0 ? (
          <EmptyState icon={<Warehouse />} title="Your garage is empty" description="Add your first bicycle to start its digital record." action={addButton} />
        ) : (
          <GarageBrowser
            bikes={bikes.map((b) => ({
              id: b.id, name: b.name, brand: b.brand, model: b.model, category: b.category, visibility: b.visibility,
              is_primary: b.is_primary, coverUrl: b.coverUrl, color_hex: b.color_hex, weight_kg: b.weight_kg,
              model_year: b.model_year, componentCount: b.componentCount, updated_at: b.updated_at,
            }))}
          />
        )}
      </div>
    </Container>
  );
}
