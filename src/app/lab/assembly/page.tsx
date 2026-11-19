import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Container } from "@/components/layout/container";
import { AssemblyLab } from "@/features/lab/assembly-lab";

export const metadata: Metadata = { title: "Assembly lab (P0)", robots: { index: false, follow: false } };

/**
 * P0 technical prototype of the modular 3D assembly. Only available when the server runs
 * with VELOX_LABS=1 (never set in production). Asset source: `?source=static` (default,
 * public/lab-assets) or `?source=supabase` (public bucket model-assets on the configured
 * Supabase project). `?csp=no-wasm` simulates browsers without WebAssembly CSP support.
 */
export default async function AssemblyLabPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Request-time rendering is required: the lab flag is a RUNTIME setting, and the CSP
  // nonce can only be applied to dynamically rendered pages. Without this, a build with no
  // Supabase variables prerenders the page (P0 CI finding).
  await connection();
  if (process.env.VELOX_LABS !== "1") notFound();
  const params = await searchParams;
  const source = params.source === "supabase" ? "supabase" : "static";
  const cspMode = params.csp === "no-wasm" ? "no-wasm" : "default";
  // KTX2 is off by default (P0 finding: the bundled Basis transcoder needs 'unsafe-eval').
  const enableKtx2 = params.ktx2 === "1";

  // Trusted pointer: the server knows which immutable manifest to use and its SHA-256.
  const pointer = readFileSync(join(process.cwd(), "public", "lab-assets", "manifest.json"));
  const manifestSha = createHash("sha256").update(pointer).digest("hex");
  const manifestFile = `manifest-${manifestSha.slice(0, 12)}.json`;
  const baseUrl =
    source === "supabase" && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/model-assets/`
      : "/lab-assets/";

  return (
    <Container className="flex flex-col gap-6 py-10">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">P0 prototype · not a product page</span>
        <h1 className="text-xl font-semibold">Modular assembly lab</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Independently authored demo frames and forks (fictional, labelled demo assets) assembled at their attachment points, with wheels and tires generated from
          recorded dimensions. Every replacement changes the actual geometry; parts without data or without a model show an explicit state instead.
        </p>
      </header>
      <AssemblyLab baseUrl={baseUrl} manifestFile={manifestFile} manifestSha={manifestSha} source={source} cspMode={cspMode} enableKtx2={enableKtx2} />
    </Container>
  );
}
