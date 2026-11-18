import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { RevisionInspector } from "@/features/history/revision-inspector";
import { loadOwnedBike } from "@/server/bike-context";
import { getRevisions } from "@/server/queries/garage";

export const metadata: Metadata = { title: "Build history" };

export default async function HistoryPage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const { session, bike } = await loadOwnedBike(bikeId);
  const revisions = await getRevisions(session, bikeId, 200);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {revisions.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="No build revisions yet"
          description="Every confirmed configuration change in the Studio creates an immutable revision here."
          action={<Button asChild variant="primary"><Link href={`/garage/${bike.id}/studio`}>Open 3D Studio</Link></Button>}
        />
      ) : (
        <RevisionInspector revisions={revisions} />
      )}
    </div>
  );
}
