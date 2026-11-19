import type { NextRequest } from "next/server";
import { handleClientErrorReport } from "@/server/client-error-intake";

/**
 * Browser failure beacons (3D loading, WebGL context loss, render errors) → server-side
 * monitoring. Validation, abuse limits and privacy rules: src/server/client-error-intake.ts.
 * Excluded from the proxy (src/proxy.ts) so anonymous beacons never trigger Supabase
 * Auth calls.
 */
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleClientErrorReport(request, request.nextUrl.origin);
}
