/**
 * Deterministic fingerprints, used to PROVE that a replacement changed the geometry:
 *  - geometryFingerprint: positions (in asset-root space) quantised to 0.1 mm + indices
 *  - stable hashing of the assembly description
 * Identical in Node (pipeline, tests) and the browser (renderer).
 */

/** Two independent 32-bit FNV-1a lanes → 16 hex chars. Not cryptographic (integrity uses SHA-256). */
export function hash64(input: string | ArrayLike<number>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  const feed = (byte: number) => {
    h1 ^= byte;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= byte;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  };
  if (typeof input === "string") {
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      feed(c & 0xff);
      feed(c >>> 8);
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      const v = input[i] | 0;
      feed(v & 0xff);
      feed((v >>> 8) & 0xff);
      feed((v >>> 16) & 0xff);
      feed((v >>> 24) & 0xff);
    }
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export interface MeshSample {
  /** Original node name (sorted for order independence). */
  name: string;
  /** Vertex positions in asset-root space, xyz triplets. */
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
}

export const FINGERPRINT_STEP_M = 0.0001;

/** Fingerprint of decoded geometry. Order-independent across meshes (sorted by name). */
export function geometryFingerprint(meshes: MeshSample[]): string {
  const parts = [...meshes]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((m) => {
      const q = new Int32Array(m.positions.length);
      for (let i = 0; i < m.positions.length; i++) q[i] = Math.round(m.positions[i] / FINGERPRINT_STEP_M);
      const idx = m.indices ? Array.from(m.indices) : [];
      return `${m.name}:${m.positions.length / 3}:${hash64(q)}:${idx.length}:${hash64(idx)}`;
    });
  return hash64(parts.join("|"));
}

/** Stable JSON (sorted keys) for hashing descriptions. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** Round to a step without float noise (0.1 → 988.3, not 988.3000000000001). */
export function round(n: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number((Math.round(n / step) * step).toFixed(decimals));
}
