// Vendored unchanged from meshoptimizer@1.3.0 (MIT). Used only when WebAssembly is unavailable.
export declare const MeshoptDecoder: {
  supported: boolean;
  ready: Promise<void>;
  decodeGltfBuffer(target: Uint8Array, count: number, size: number, source: Uint8Array, mode: string, filter?: string): void;
};
