/**
 * Published asset set (public/model-assets): integrity, decoder equivalence (WASM vs JS
 * reference), contract after decoding, immutable naming, vendored decoder drift.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { MeshoptDecoder as ReferenceDecoder } from "../../src/features/studio/assembly/vendor/meshopt_decoder_reference.js";
import { geometryFingerprint } from "@/lib/assembly/fingerprint";
import { validateAsset } from "@/lib/assembly/validate";
import type { AssetManifest } from "@/lib/assembly/spec";
import { measure } from "../../scripts/assets/measure.mts";

const ROOT = join(__dirname, "..", "..");
const LAB = join(ROOT, "public", "model-assets");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const pointer = readFileSync(join(LAB, "manifest.json"));
const manifest = JSON.parse(pointer.toString()) as AssetManifest;

describe("published asset set", () => {
  it("the manifest pointer equals an immutable, content-addressed manifest file", () => {
    const immutable = readFileSync(join(LAB, `manifest-${sha(pointer).slice(0, 12)}.json`));
    expect(sha(immutable)).toBe(sha(pointer));
    expect(manifest.assets.map((a) => a.key).sort()).toEqual(["fork-demo-carbon-disc", "fork-gravel-demo", "fork-mtb-rigid-demo", "fork-road-demo", "frame-hardtail-demo", "frame-road-demo"]);
  });

  it("every file is content-hashed and matches its SHA-256", () => {
    for (const a of manifest.assets) {
      const bytes = readFileSync(join(LAB, a.file));
      expect(sha(bytes), a.key).toBe(a.sha256);
      expect(a.file).toContain(a.sha256.slice(0, 12));
      expect(bytes.byteLength).toBe(a.bytes);
      for (const t of a.textures) {
        expect(sha(readFileSync(join(LAB, t.ktx2.file)))).toBe(t.ktx2.sha256);
        expect(sha(readFileSync(join(LAB, t.fallback.file)))).toBe(t.fallback.sha256);
      }
    }
  });

  for (const [label, decoder] of [["WASM decoder", MeshoptDecoder], ["JS reference decoder (no-WASM fallback)", ReferenceDecoder]] as const) {
    it(`${label}: decoded geometry matches the pipeline fingerprint and the contract still holds`, async () => {
      await decoder.ready;
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": decoder });
      for (const a of manifest.assets) {
        const doc = await io.readBinary(new Uint8Array(readFileSync(join(LAB, a.file))));
        const m = measure(doc);
        expect(geometryFingerprint(m.samples), a.key).toBe(a.geometryFingerprint);
        expect(validateAsset(m.decl, m.file), a.key).toEqual([]);
        expect(m.rootIsIdentity).toBe(true);
      }
    });
  }

  it("assets are compressed and within budget; representation is honest (demo assets are never 'exact')", () => {
    for (const a of manifest.assets) {
      expect(a.compression).toBe("meshopt");
      expect(a.demo).toBe(true);
      expect(a.representation).toBe("representative");
      expect(a.license.id).toBeTruthy();
    }
  });
});

describe("vendored decoders stay identical to their packages", () => {
  it("Basis transcoder (three) and meshopt JS reference decoder (meshoptimizer)", () => {
    for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
      expect(sha(readFileSync(join(ROOT, "public/vendor/basis", f))), f).toBe(sha(readFileSync(join(ROOT, "node_modules/three/examples/jsm/libs/basis", f))));
    }
    expect(sha(readFileSync(join(ROOT, "src/features/studio/assembly/vendor/meshopt_decoder_reference.js")))).toBe(sha(readFileSync(join(ROOT, "node_modules/meshoptimizer/meshopt_decoder_reference.js"))));
  });
});
