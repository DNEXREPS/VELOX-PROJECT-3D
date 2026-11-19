"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { AssemblyNode, AssemblySpec, ManifestEntry, MaterialRole } from "@/lib/assembly/spec";
import { buildTire, buildWheel } from "@/lib/assembly/generators";
import { geometryFingerprint } from "@/lib/assembly/fingerprint";
import { poseToMatrix } from "@/lib/assembly/math";
import { AssetLoader, fingerprintObject, type LoaderReport } from "./asset-loader";

export interface RenderState {
  /** nodeId → source signature currently on screen. */
  rendered: Record<string, string>;
  /** nodeId → geometry fingerprint of what is on screen. */
  geometry: Record<string, string>;
  pending: number;
  errors: string[];
  memory: { geometries: number; textures: number };
  cachedAssets: string[];
  report: LoaderReport | null;
}

const ROLE_MATERIAL: Partial<Record<MaterialRole, () => THREE.MeshStandardMaterial>> = {
  metal: () => new THREE.MeshStandardMaterial({ color: "#a7adb4", metalness: 0.85, roughness: 0.32 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: "#1a1a1a", metalness: 0, roughness: 0.9 }),
};

export function sourceSignature(n: AssemblyNode): string | null {
  if (n.status !== "ok" || !n.source) return null;
  return n.source.kind === "asset" ? `asset:${n.source.key}@${n.source.version}:${n.source.sha256.slice(0, 12)}` : `gen:${n.source.generator}@${n.source.version}:${JSON.stringify(n.source.params)}`;
}

interface Live {
  sig: string;
  object: THREE.Object3D;
  release: () => void;
}

function Nodes({ spec, manifest, baseUrl, onState, enableKtx2 }: ViewProps) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);
  const live = useRef(new Map<string, Live>());
  const loader = useRef<AssetLoader | null>(null);
  const pending = useRef(0);
  const errors = useRef<string[]>([]);
  const geometry = useRef<Record<string, string>>({});

  const publish = () => {
    const rendered: Record<string, string> = {};
    live.current.forEach((l, id) => (rendered[id] = l.sig));
    onState({
      rendered,
      geometry: { ...geometry.current },
      pending: pending.current,
      errors: [...errors.current],
      memory: { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures },
      cachedAssets: loader.current?.cachedKeys ?? [],
      report: loader.current ? JSON.parse(JSON.stringify(loader.current.report)) : null,
    });
  };

  useEffect(() => {
    loader.current ??= new AssetLoader(baseUrl, gl, () => publish(), enableKtx2);
    const root = group.current!;
    const wanted = new Map(spec.nodes.map((n) => [n.id, n]));

    // 1) Remove everything whose source changed or disappeared — BEFORE loading the
    //    replacement, so old geometry never stands in for a new component.
    for (const [id, l] of [...live.current]) {
      const n = wanted.get(id);
      if (!n || sourceSignature(n) !== l.sig) {
        root.remove(l.object);
        l.release();
        live.current.delete(id);
        delete geometry.current[id];
      }
    }
    // 2) Add new nodes; 3) apply world poses to everything on screen.
    const place = (n: AssemblyNode, obj: THREE.Object3D) => {
      obj.matrixAutoUpdate = false;
      obj.matrix.copy(poseToMatrix(n.world!));
      obj.matrixWorldNeedsUpdate = true;
    };
    for (const n of spec.nodes) {
      const sig = sourceSignature(n);
      if (!sig || !n.world) continue;
      const existing = live.current.get(n.id);
      if (existing) {
        place(n, existing.object);
        continue;
      }
      if (n.source!.kind === "generator") {
        const parts = n.source!.generator === "wheel" ? buildWheel(n.source!.params) : buildTire(n.source!.params);
        const obj = new THREE.Group();
        obj.userData.veloxNode = n.id;
        for (const p of parts) {
          const m = new THREE.Mesh(p.geometry, (ROLE_MATERIAL[p.role] ?? ROLE_MATERIAL.metal)!());
          m.name = p.name;
          obj.add(m);
        }
        geometry.current[n.id] = geometryFingerprint(parts.map((p) => ({ name: p.name, positions: p.geometry.getAttribute("position").array, indices: p.geometry.getIndex()?.array ?? null })));
        place(n, obj);
        root.add(obj);
        live.current.set(n.id, {
          sig,
          object: obj,
          release: () =>
            obj.children.forEach((c) => {
              (c as THREE.Mesh).geometry.dispose();
              ((c as THREE.Mesh).material as THREE.Material).dispose();
            }),
        });
        continue;
      }
      const src = n.source as Extract<NonNullable<AssemblyNode["source"]>, { kind: "asset" }>;
      const entry = manifest.get(`${src.key}@${src.version}`);
      if (!entry) {
        errors.current.push(`${n.id}: ${src.key}@${src.version} missing from manifest`);
        continue;
      }
      pending.current++;
      const placeholder: Live = { sig, object: new THREE.Group(), release: () => undefined };
      live.current.set(n.id, placeholder);
      void loader.current!.acquire(entry).then(
        (obj) => {
          pending.current--;
          // The spec may have moved on while loading: only attach if still wanted.
          if (live.current.get(n.id) !== placeholder) {
            loader.current!.release(entry, obj);
          } else {
            obj.userData.veloxNode = n.id;
            const holder = new THREE.Group();
            holder.add(obj);
            place(wanted.get(n.id) ?? n, holder);
            root.add(holder);
            geometry.current[n.id] = fingerprintObject(obj);
            live.current.set(n.id, { sig, object: holder, release: () => loader.current!.release(entry, obj) });
          }
          invalidate();
          publish();
        },
        (e: unknown) => {
          pending.current--;
          live.current.delete(n.id);
          errors.current.push(`${n.id}: ${e instanceof Error ? e.message : String(e)}`);
          publish();
        },
      );
    }
    invalidate();
    publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  // Live GPU counters for tests (read after a frame, not at publish time).
  useEffect(() => {
    (window as unknown as { __veloxLabMemory?: () => { geometries: number; textures: number } }).__veloxLabMemory = () => ({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures });
  }, [gl]);

  useEffect(
    () => () => {
      live.current.forEach((l) => l.release());
      live.current.clear();
      loader.current?.dispose();
    },
    [],
  );

  return <group ref={group} />;
}

interface ViewProps {
  spec: AssemblySpec;
  manifest: Map<string, ManifestEntry>;
  baseUrl: string;
  onState: (s: RenderState) => void;
  enableKtx2: boolean;
}

export function AssemblyView(props: ViewProps) {
  return (
    <Canvas
      data-testid="lab-canvas"
      frameloop="demand"
      dpr={1}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [0.35, 0.75, 2.6], fov: 35, near: 0.05, far: 30 }}
      onCreated={({ gl }) => gl.setClearColor("#14171c")}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} />
      <gridHelper args={[4, 40, "#2b3038", "#20242b"]} />
      <Nodes {...props} />
      <OrbitControls target={[0.3, 0.45, 0]} makeDefault />
    </Canvas>
  );
}
