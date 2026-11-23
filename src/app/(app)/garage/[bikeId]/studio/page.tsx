import type { Metadata } from "next";
import { StudioClient } from "@/features/studio/components/studio-client";
import { loadOwnedBike } from "@/server/bike-context";
import { getConfiguration } from "@/server/queries/garage";
import { isBikeSlot } from "@/lib/domain/slots";
import { getModelManifestRef } from "@/server/model-assets";

export const metadata: Metadata = { title: "3D Studio" };

export default async function StudioPage({ params, searchParams }: { params: Promise<{ bikeId: string }>; searchParams: Promise<{ slot?: string }> }) {
  const { bikeId } = await params;
  const { slot } = await searchParams;
  const { session, bike } = await loadOwnedBike(bikeId);
  const installed = await getConfiguration(session, bikeId);
  return (
    <StudioClient
      bikeId={bike.id}
      modelKey={bike.model_key}
      category={bike.category}
      paintColor={bike.color_hex}
      installed={installed}
      initialSlot={isBikeSlot(slot) ? slot : null}
      manifestRef={getModelManifestRef()}
    />
  );
}
