/**
 * Decoder benchmark for the performance budget (P0). Synthetic meshes at the frame
 * budget (40k triangles) and the whole-bike budget (150k), compressed exactly like the
 * pipeline, decoded with the WASM decoder and the JS reference decoder (no-WASM fallback).
 *   npx tsx scripts/assets/bench-decoders.mts
 */
import * as THREE from "three";
import { Document, NodeIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, quantize, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { MeshoptDecoder as Reference } from "../../src/features/lab/vendor/meshopt_decoder_reference.js";

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

function makeDoc(targetTris: number): Document {
  const g = new THREE.TorusKnotGeometry(0.3, 0.05, Math.round(targetTris / 32), 16);
  const doc = new Document();
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  const buf = doc.createBuffer();
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.getAttribute("position").array)).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.getAttribute("normal").array)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.getIndex()!.array)).setBuffer(buf));
  doc.createScene().addChild(doc.createNode("n").setMesh(doc.createMesh().addPrimitive(prim)));
  return doc;
}

const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const tris of [40_000, 150_000]) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const raw = await io.writeBinary(makeDoc(tris));
  const doc = makeDoc(tris);
  await doc.transform(weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const packed = await io.writeBinary(doc);
  const row: string[] = [`${tris.toLocaleString("en")} tris`, `raw ${(raw.byteLength / 1024).toFixed(0)} KB`, `meshopt ${(packed.byteLength / 1024).toFixed(0)} KB`];
  for (const [name, dec] of [["wasm", MeshoptDecoder], ["js-reference", Reference]] as const) {
    const rio = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": dec });
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await rio.readBinary(packed);
      times.push(performance.now() - t0);
    }
    row.push(`${name} ${median(times).toFixed(1)} ms`);
  }
  console.log(row.join("  |  "));
}
