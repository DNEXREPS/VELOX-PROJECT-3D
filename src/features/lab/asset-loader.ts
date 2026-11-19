"use client";
/**
 * P0 asset loader: integrity-verified fetch, meshopt (WASM → JS fallback), KTX2 (WASM →
 * PNG fallback), reference-counted cache with disposal. Production code (P1) will move
 * this to features/studio/three with the same behaviour.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { geometryFingerprint, type MeshSample } from "@/lib/assembly/fingerprint";
import type { ManifestEntry, TextureEntry } from "@/lib/assembly/spec";
import { MeshoptDecoder as ReferenceDecoder } from "./vendor/meshopt_decoder_reference.js";

export type DecoderKind = "wasm" | "js-reference";
export type TextureKind = "ktx2" | "png-fallback" | "none";

export interface LoaderReport {
  decoder: DecoderKind | "pending";
  decoderError?: string;
  /** "disabled": no CSP-compatible Basis transcoder (three's build needs 'unsafe-eval'). */
  ktx2: "supported" | "unavailable" | "disabled" | "pending";
  ktx2Error?: string;
  integrityChecks: number;
  integrityFailures: string[];
  fingerprintMatches: number;
  fingerprintMismatches: string[];
  textures: Record<string, TextureKind>;
  loadsMs: Record<string, number>;
}

export class IntegrityError extends Error {}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch an immutable, content-hashed file and verify it BEFORE parsing. */
export async function fetchVerified(url: string, expectedSha256: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const actual = await sha256Hex(buf);
  if (actual !== expectedSha256) throw new IntegrityError(`${url}: SHA-256 mismatch (expected ${expectedSha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
  return buf;
}

/** Decoded geometry fingerprint, comparable with the pipeline's (positions in asset-root space). */
export function fingerprintObject(root: THREE.Object3D): string {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const samples: MeshSample[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const rel = inv.clone().multiply(mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute("position");
    const positions = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const index = mesh.geometry.getIndex();
    samples.push({ name: (mesh.userData.name as string | undefined) ?? mesh.name, positions, indices: index ? index.array : null });
  });
  return geometryFingerprint(samples);
}

interface CacheEntry {
  promise: Promise<{ scene: THREE.Object3D; textures: Map<string, THREE.Texture> }>;
  refs: number;
}

export class AssetLoader {
  readonly report: LoaderReport = {
    decoder: "pending",
    ktx2: "pending",
    integrityChecks: 0,
    integrityFailures: [],
    fingerprintMatches: 0,
    fingerprintMismatches: [],
    textures: {},
    loadsMs: {},
  };
  private gltf = new GLTFLoader();
  private ktx2: KTX2Loader | null = null;
  private cache = new Map<string, CacheEntry>();
  private ready: Promise<void>;

  constructor(
    private baseUrl: string,
    renderer: THREE.WebGLRenderer,
    private onChange: () => void,
    /** P0 finding: keep false until a transcoder built without dynamic code execution is vendored. */
    private enableKtx2 = false,
  ) {
    this.ready = this.init(renderer);
  }

  private async init(renderer: THREE.WebGLRenderer) {
    // Geometry decoder: WebAssembly first; the JS reference decoder if WASM is blocked
    // (CSP without 'wasm-unsafe-eval', e.g. older Safari) or missing.
    try {
      if (typeof WebAssembly !== "object") throw new Error("WebAssembly not available");
      const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
      await MeshoptDecoder.ready;
      this.gltf.setMeshoptDecoder(MeshoptDecoder);
      this.report.decoder = "wasm";
    } catch (e) {
      this.report.decoderError = e instanceof Error ? e.message : String(e);
      this.gltf.setMeshoptDecoder(ReferenceDecoder as unknown as Parameters<GLTFLoader["setMeshoptDecoder"]>[0]);
      this.report.decoder = "js-reference";
    }
    // Texture transcoder: Basis/KTX2 needs WebAssembly in a worker. Probe it once with a
    // tiny module compile (same CSP rule as the worker inherits).
    if (!this.enableKtx2) {
      this.report.ktx2 = "disabled";
      this.onChange();
      return;
    }
    try {
      if (typeof WebAssembly !== "object") throw new Error("WebAssembly not available");
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      this.ktx2 = new KTX2Loader().setTranscoderPath("/vendor/basis/").detectSupport(renderer);
      this.report.ktx2 = "supported";
    } catch (e) {
      this.report.ktx2Error = e instanceof Error ? e.message : String(e);
      this.report.ktx2 = "unavailable";
    }
    this.onChange();
  }

  private async loadTexture(entry: ManifestEntry, t: TextureEntry): Promise<THREE.Texture> {
    const id = `${entry.key}@${entry.version}:${t.role}`;
    if (this.ktx2) {
      try {
        const buf = await fetchVerified(this.baseUrl + t.ktx2.file, t.ktx2.sha256);
        this.report.integrityChecks++;
        // Parse the verified bytes directly (no blob: URL fetch, which connect-src forbids).
        // The transcoder worker can fail without settling (e.g. CSP blocks its code); time out.
        const tex = await Promise.race([
          new Promise<THREE.CompressedTexture>((resolve, reject) => this.ktx2!.parse(buf, resolve as (t: THREE.CompressedTexture) => void, reject)),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("KTX2 transcode timed out")), 4000)),
        ]);
        this.report.textures[id] = "ktx2";
        return tex;
      } catch (e) {
        if (e instanceof IntegrityError) throw e;
        this.report.ktx2Error = e instanceof Error ? e.message : String(e);
      }
    }
    const buf = await fetchVerified(this.baseUrl + t.fallback.file, t.fallback.sha256);
    this.report.integrityChecks++;
    const bitmap = await createImageBitmap(new Blob([buf], { type: t.fallback.mime }), { imageOrientation: "flipY" });
    const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.report.textures[id] = "png-fallback";
    return tex;
  }

  /** Acquire a reference to an asset; the returned object is a fresh clone (geometry shared). */
  async acquire(entry: ManifestEntry): Promise<THREE.Object3D> {
    await this.ready;
    const key = `${entry.key}@${entry.version}`;
    let c = this.cache.get(key);
    if (!c) {
      const started = performance.now();
      const promise = (async () => {
        let buf: ArrayBuffer;
        try {
          buf = await fetchVerified(this.baseUrl + entry.file, entry.sha256);
          this.report.integrityChecks++;
        } catch (e) {
          this.report.integrityFailures.push(e instanceof Error ? e.message : String(e));
          throw e;
        }
        const gltf = await this.gltf.parseAsync(buf, "");
        const scene = gltf.scene.children[0] ?? gltf.scene;
        const fp = fingerprintObject(scene);
        if (fp === entry.geometryFingerprint) this.report.fingerprintMatches++;
        else this.report.fingerprintMismatches.push(`${key}: decoded ${fp} ≠ pipeline ${entry.geometryFingerprint}`);
        const textures = new Map<string, THREE.Texture>();
        for (const t of entry.textures) textures.set(t.role, await this.loadTexture(entry, t));
        this.report.loadsMs[key] = Math.round(performance.now() - started);
        this.onChange();
        return { scene, textures };
      })();
      c = { promise, refs: 0 };
      this.cache.set(key, c);
    }
    c.refs++;
    const { scene, textures } = await c.promise;
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      const role = entry.materials[(mesh.material as THREE.Material).name];
      const tex = role ? textures.get(role) : undefined;
      if (tex) {
        material.map = tex;
        material.color.set("#ffffff");
      }
      mesh.material = material;
    });
    return clone;
  }

  /** Release a reference; at zero, GPU resources of the asset are disposed. */
  release(entry: ManifestEntry, clone: THREE.Object3D) {
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
    });
    const key = `${entry.key}@${entry.version}`;
    const c = this.cache.get(key);
    if (!c) return;
    c.refs--;
    if (c.refs > 0) return;
    this.cache.delete(key);
    void c.promise.then(({ scene, textures }) => {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      textures.forEach((t) => t.dispose());
    }, () => undefined);
  }

  get cachedKeys(): string[] {
    return [...this.cache.keys()];
  }

  dispose() {
    this.ktx2?.dispose();
  }
}
