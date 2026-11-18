import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { BIKE_SLOTS } from "@/lib/domain/slots";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSlotCandidates } from "@/server/queries/components";

const query = z.object({
  slot: z.enum(BIKE_SLOTS),
  q: z.string().max(80).optional(),
});

/** Components that can occupy a slot, with specs + compatibility attributes (studio picker). */
export async function GET(request: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  try {
    const items = await listSlotCandidates(supabase, parsed.data.slot, parsed.data.q);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ error: "Could not load components" }, { status: 500 });
  }
}
