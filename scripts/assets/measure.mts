/** Measures a glTF document for the velox-assembly/1 contract (shared by the pipeline and tests). */
import * as THREE from "three";
import type { Document, Node as GNode } from "@gltf-transform/core";
import type { MeshSample } from "../../src/lib/assembly/fingerprint.ts";
import type { MeasuredFile } from "../../src/lib/assembly/validate.ts";
import type { AssetDeclaration, Pose } from "../../src/lib/assembly/spec.ts";

export function assetRoot(doc: Document): GNode {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const roots = scene?.listChildren() ?? [];
  if (roots.length !== 1) throw new Error(`expected exactly one root node, found ${roots.length}`);
  return roots[0];
}

function poseOf(m: number[]): Pose {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  new THREE.Matrix4().fromArray(m).decompose(t, q, s);
  return { t: [t.x, t.y, t.z], r: [q.x, q.y, q.z, q.w] };
}

function collectStrings(v: unknown, out: string[]) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => (out.push(k), collectStrings(x, out)));
}

export function measure(doc: Document): { decl: AssetDeclaration; file: MeasuredFile; samples: MeshSample[]; rootIsIdentity: boolean } {
  const root = assetRoot(doc);
  const decl = (root.getExtras() as { velox?: AssetDeclaration }).velox;
  if (!decl) throw new Error("root node has no extras.velox declaration");
  const rootInverse = new THREE.Matrix4().fromArray(root.getWorldMatrix()).invert();
  const file: MeasuredFile = { nodeNames: [], meshNodeNames: [], multiPrimitiveNodes: [], materialNames: [], nodePoses: {}, triangles: 0, strings: [] };
  const samples: MeshSample[] = [];
  root.traverse((n) => {
    if (n === root) return;
    const name = n.getName();
    file.nodeNames.push(name);
    const rel = new THREE.Matrix4().multiplyMatrices(rootInverse, new THREE.Matrix4().fromArray(n.getWorldMatrix()));
    file.nodePoses[name] = poseOf(rel.toArray());
    collectStrings(n.getExtras(), file.strings);
    const mesh = n.getMesh();
    if (!mesh) return;
    file.meshNodeNames.push(name);
    const prims = mesh.listPrimitives();
    if (prims.length > 1) file.multiPrimitiveNodes.push(name);
    for (const p of prims) {
      const pos = p.getAttribute("POSITION")!;
      const idx = p.getIndices();
      file.triangles += (idx ? idx.getCount() : pos.getCount()) / 3;
      const positions = new Float64Array(pos.getCount() * 3);
      const el: number[] = [];
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        v.set(el[0], el[1], el[2]).applyMatrix4(rel);
        positions.set([v.x, v.y, v.z], i * 3);
      }
      samples.push({ name, positions, indices: idx ? (idx.getArray() as ArrayLike<number>) : null });
    }
  });
  for (const m of doc.getRoot().listMaterials()) file.materialNames.push(m.getName());
  file.strings.push(...file.nodeNames, ...file.materialNames, doc.getRoot().getAsset().generator ?? "", doc.getRoot().getAsset().copyright ?? "");
  collectStrings({ ...decl, license: { ...decl.license, url: undefined } }, file.strings);
  const rootIsIdentity = root.getMatrix().every((x, i) => Math.abs(x - new THREE.Matrix4().identity().elements[i]) < 1e-9);
  return { decl, file, samples, rootIsIdentity };
}

