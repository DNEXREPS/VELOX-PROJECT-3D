/**
 * VELOX asset pipeline (P0). Source-independent: any glTF 2.0 binary placed in
 * assets-src/ (procedural author, open-licence download, commissioned model) goes
 * through the same gates. Fails the run on any issue; nothing partial is published.
 *
 *   npx tsx scripts/assets/pipeline.mts [--out public/model-assets]
 *
 * Steps per asset:
 *  1. Khronos glTF-Validator (errors fail)
 *  2. velox-assembly/1 contract (src/lib/assembly/validate.ts): naming, interfaces, axis
 *     rules, declared vs measured geometry, budgets, licence, privacy scan
 *  3. optimise: dedup → weld → quantize → EXT_meshopt_compression (anchors kept)
 *  4. re-read the OUTPUT with the meshopt decoder and re-run the interface checks
 *  5. geometry fingerprint of the decoded output (cross-checked by the browser)
 *  6. textures: PNG → KTX2 (ETC1S) + PNG fallback
 *  7. content-hashed file names + versioned manifest
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
// @ts-expect-error — no type declarations shipped
import validator from "gltf-validator";
import { encodeToKTX2 } from "ktx2-encoder";
import { decodePng } from "./png.mts";
import { geometryFingerprint } from "../../src/lib/assembly/fingerprint.ts";
import { measure } from "./measure.mts";
import { validateAsset } from "../../src/lib/assembly/validate.ts";
import { ASSEMBLY_SPEC, type AssetManifest, type ManifestEntry, type TextureEntry } from "../../src/lib/assembly/spec.ts";

export const PIPELINE_VERSION = "velox-pipeline/0.1";
const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "assets-src");
const outArg = process.argv.indexOf("--out");
const OUT = join(ROOT, outArg > 0 ? process.argv[outArg + 1] : "public/model-assets");

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

async function processAsset(srcFile: string): Promise<ManifestEntry> {
  const bytes = readFileSync(srcFile);
  const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 50 });
  if (report.issues.numErrors > 0) throw new Error(`glTF-Validator: ${report.issues.numErrors} error(s): ${report.issues.messages.filter((m: { severity: number }) => m.severity === 0).map((m: { message: string }) => m.message).slice(0, 3).join("; ")}`);

  const doc = await io.readBinary(new Uint8Array(bytes));
  const before = measure(doc);
  const issues = validateAsset(before.decl, before.file);
  if (!before.rootIsIdentity) issues.push("asset root node must have an identity transform");
  if (issues.length) throw new Error(`contract:\n  - ${issues.join("\n  - ")}`);

  // Strip authoring-tool metadata; keep extras (the declaration) and empty interface nodes.
  doc.getRoot().getAsset().generator = PIPELINE_VERSION;
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(dedup(), prune({ keepLeaves: true, keepExtras: true }), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = await io.writeBinary(doc);

  // Re-read the compressed output exactly as a client would and re-check the contract.
  const after = measure(await io.readBinary(out));
  const afterIssues = validateAsset(after.decl, after.file);
  if (afterIssues.length) throw new Error(`contract after optimisation:\n  - ${afterIssues.join("\n  - ")}`);
  const outReport = await validator.validateBytes(out, { maxIssues: 10 });
  if (outReport.issues.numErrors > 0) throw new Error("optimised output fails glTF-Validator");

  const decl = after.decl;
  const hash = sha256(out);
  const file = `models/${decl.kind}/${decl.key}/${decl.version}-${hash.slice(0, 12)}.glb`;
  mkdirSync(dirname(join(OUT, file)), { recursive: true });
  writeFileSync(join(OUT, file), out);

  const textures: TextureEntry[] = [];
  for (const t of decl.textures ?? []) {
    const png = readFileSync(join(SRC, t.source));
    const ktx2 = await encodeToKTX2(new Uint8Array(png), { isUASTC: false, generateMipmap: true, qualityLevel: 160, isSetKTX2SRGBTransferFunc: true, imageDecoder: decodePng });
    const kHash = sha256(ktx2);
    const pHash = sha256(png);
    const kFile = `textures/${decl.key}/${decl.version}-${t.role}-${kHash.slice(0, 12)}.ktx2`;
    const pFile = `textures/${decl.key}/${decl.version}-${t.role}-${pHash.slice(0, 12)}.png`;
    mkdirSync(dirname(join(OUT, kFile)), { recursive: true });
    writeFileSync(join(OUT, kFile), ktx2);
    writeFileSync(join(OUT, pFile), png);
    textures.push({ role: t.role, ktx2: { file: kFile, sha256: kHash, bytes: ktx2.byteLength }, fallback: { file: pFile, sha256: pHash, bytes: png.byteLength, mime: "image/png" } });
  }

  const { textures: _sources, ...rest } = decl;
  void _sources;
  const entry: ManifestEntry = {
    ...rest,
    file,
    sha256: hash,
    bytes: out.byteLength,
    triangles: after.file.triangles,
    geometryFingerprint: geometryFingerprint(after.samples),
    compression: "meshopt",
    textures,
    pipeline: PIPELINE_VERSION,
  };
  console.log(`✓ ${decl.key}@${decl.version}  ${(bytes.byteLength / 1024).toFixed(1)} KB → ${(out.byteLength / 1024).toFixed(1)} KB  ${entry.triangles} tris  ${textures.length ? `${textures.length} texture(s)` : ""}`);
  return entry;
}

const sources = readdirSync(SRC).filter((f) => f.endsWith(".glb")).sort();
if (!sources.length) throw new Error("no source assets in assets-src/ — run the authoring scripts first");
const entries: ManifestEntry[] = [];
const failures: string[] = [];
for (const s of sources) {
  try {
    entries.push(await processAsset(join(SRC, s)));
  } catch (e) {
    failures.push(`✗ ${s}: ${(e as Error).message}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
const manifest: AssetManifest = { spec: ASSEMBLY_SPEC, manifestVersion: 1, generatedAt: "pipeline", assets: entries };
const body = `${JSON.stringify(manifest, null, 2)}\n`;
const mHash = sha256(Buffer.from(body));
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `manifest-${mHash.slice(0, 12)}.json`), body);
writeFileSync(join(OUT, "manifest.json"), body);
console.log(`manifest-${mHash.slice(0, 12)}.json (${entries.length} assets) → ${OUT}`);
if (!existsSync(join(OUT, "manifest.json"))) process.exit(1);
