import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { getMyBicycle } from "@/server/queries/garage";

/** Load an owned bicycle for /garage/[bikeId]/* (memoised per request). 404 for others' bikes. */
export const loadOwnedBike = cache(async (bikeId: string) => {
  if (!z.uuid().safeParse(bikeId).success) notFound();
  const session = await requireSession(`/garage/${bikeId}`);
  const detail = await getMyBicycle(session, bikeId);
  if (!detail) notFound();
  return { session, ...detail };
});
