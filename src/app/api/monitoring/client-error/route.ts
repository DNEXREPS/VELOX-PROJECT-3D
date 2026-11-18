import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CLIENT_ERROR_KINDS } from "@/lib/monitoring/client";
import { captureMessage } from "@/lib/monitoring";
import { scrubPath, scrubString } from "@/lib/monitoring/scrub";

/**
 * Receives browser-side failure beacons (3D loading, WebGL context loss, render errors)
 * and forwards them to server-side monitoring. Nothing is stored. Same-origin only,
 * small bodies only, strict schema, everything scrubbed again server-side.
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 2048;

const reportSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().max(400),
  model: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
  digest: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  path: z.string().max(300).optional(),
});

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === request.nextUrl.origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY) return new NextResponse(null, { status: 413 });

  const text = await request.text();
  if (text.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const r = parsed.data;
  await captureMessage(r.kind === "render" ? "error" : r.kind === "3d-load" ? "error" : "warning", r.kind === "render" ? "client" : "client-3d", `client.${r.kind}`, scrubString(r.message, 300), {
    model: r.model,
    digest: r.digest,
    path: r.path ? scrubPath(r.path) : undefined,
  });
  return new NextResponse(null, { status: 204 });
}
