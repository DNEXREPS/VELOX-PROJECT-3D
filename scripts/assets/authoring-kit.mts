/**
 * Minimal authoring kit for VELOX test assets (Node). It does NOT know about any other
 * part: authors only share the velox-assembly/1 contract (interface frames, naming,
 * declaration). Real production assets come from DCC tools (Blender etc.) and are
 * checked by the same pipeline.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { interfaceFrame } from "../../src/lib/assembly/math.ts";
import type { AnchorDecl, AssetDeclaration, InterfaceType, MountDecl, Vec3 } from "../../src/lib/assembly/spec.ts";

class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onload: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onload?.();
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString("base64")}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

export const OUT_DIR = join(import.meta.dirname, "..", "..", "assets-src");

export function tube(a: Vec3, b: Vec3, r1: number, r2 = r1, segments = 16): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r2, r1, dir.length(), segments, 1, false);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(...a);
  return g;
}

/** Create the empty node for an interface and return its declaration. */
export function iface<T extends AnchorDecl | MountDecl>(root: THREE.Object3D, prefix: "ANC__" | "MNT__", id: string, type: InterfaceType, origin: Vec3, z: Vec3, extra: Partial<T> = {}): T {
  const pose = interfaceFrame(type, origin, z);
  const node = new THREE.Object3D();
  node.name = `${prefix}${id}`;
  node.position.set(...pose.t);
  node.quaternion.set(...pose.r);
  root.add(node);
  return { node: node.name, type, pose, ...extra } as T;
}

export async function exportAsset(root: THREE.Object3D, decl: AssetDeclaration, png?: { role: string; data: Buffer }) {
  root.name = `ASSET__${decl.key.replace(/-/g, "_")}`;
  root.userData = { velox: decl };
  mkdirSync(OUT_DIR, { recursive: true });
  const base = `${decl.key}@${decl.version}`;
  if (png) writeFileSync(join(OUT_DIR, `${base}.${png.role}.png`), png.data);
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })) as ArrayBuffer;
  writeFileSync(join(OUT_DIR, `${base}.glb`), Buffer.from(glb));
  console.log(`authored ${base}.glb (${(glb.byteLength / 1024).toFixed(0)} KB)`);
}

/** Tiny PNG writer (RGBA8) — no image dependencies. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
