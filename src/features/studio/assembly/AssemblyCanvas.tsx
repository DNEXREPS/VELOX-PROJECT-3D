"use client";
/**
 * Modular assembly renderer (P1). Renders an AssemblySpec: one scene node per spec node,
 * reconciled by id + source signature. A node whose source changes is REMOVED before its
 * replacement loads, so old geometry never stands in for a new component.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import type { AssemblyNode, AssemblySpec, ManifestEntry, MaterialRole } from "@/lib/assembly/spec";
import type { BikeSlot } from "@/lib/domain/slots";
import { GENERATORS } from "@/lib/assembly/generators";
import { geometryFingerprint } from "@/lib/assembly/fingerprint";
import { poseToMatrix } from "@/lib/assembly/math";
import { AssetLoader, fingerprintObject, type LoaderReport } from "./asset-loader";
import { computePresets, type AssemblyPreset } from "./presets";

export interface RenderState {
  /** nodeId → source signature currently on screen. */
  rendered: Record<string, string>;
  /** nodeId → geometry fingerprint of what is on screen. */
  geometry: Record<string, string>;
  pending: number;
  errors: string[];
  cachedAssets: string[];
  report: LoaderReport | null;
}

export function sourceSignature(n: AssemblyNode): string | null {
  if (n.status !== "ok" || !n.source) return null;
  return n.source.kind === "asset" ? `asset:${n.source.key}@${n.source.version}:${n.source.sha256.slice(0, 12)}` : `gen:${n.source.generator}@${n.source.version}:${n.source.variant ?? ""}:${JSON.stringify(n.source.params)}`;
}

const ROLE_COLOR: Partial<Record<MaterialRole, { color: string; metalness: number; roughness: number }>> = {
  metal: { color: "#a7adb4", metalness: 0.85, roughness: 0.32 },
  rubber: { color: "#1a1a1a", metalness: 0, roughness: 0.9 },
  carbon: { color: "#24272c", metalness: 0.2, roughness: 0.45 },
};
const SELECTED = new THREE.Color("#ff7a1a");
const PENDING = new THREE.Color("#4aa3ff");
const HOVER = new THREE.Color("#ffffff");
const PAINTED_NODES = new Set(["frame", "fork"]);

interface Live {
  sig: string;
  object: THREE.Object3D;
  release: () => void;
}

export interface AssemblyCanvasProps {
  spec: AssemblySpec;
  manifest: Map<string, ManifestEntry>;
  baseUrl: string;
  selectedSlot?: BikeSlot | null;
  hoveredSlot?: BikeSlot | null;
  pendingSlots?: BikeSlot[];
  paintColor?: string | null;
  presetId?: string;
  presetNonce?: number;
  interactive?: boolean;
  onHoverSlot?: (slot: BikeSlot | null) => void;
  onSelectSlot?: (slot: BikeSlot | null) => void;
  onState?: (s: RenderState) => void;
  enableKtx2?: boolean;
  className?: string;
}

function Scene(props: AssemblyCanvasProps & { presets: AssemblyPreset[]; liveRef: MutableRefObject<Map<string, Live>> }) {
  const { spec, manifest, baseUrl, onState, enableKtx2 = false, liveRef, selectedSlot = null, hoveredSlot = null, pendingSlots = [], paintColor = null, interactive = true } = props;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);
  const loader = useRef<AssetLoader | null>(null);
  const pending = useRef(0);
  const errors = useRef<string[]>([]);
  const geometry = useRef<Record<string, string>>({});
  const live = liveRef;
  const slotOf = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n.slot])), [spec]);

  const publish = () => {
    const rendered: Record<string, string> = {};
    live.current.forEach((l, id) => {
      if (l.object.children.length > 0) rendered[id] = l.sig;
    });
    onState?.({ rendered, geometry: { ...geometry.current }, pending: pending.current, errors: [...errors.current], cachedAssets: loader.current?.cachedKeys ?? [], report: loader.current ? JSON.parse(JSON.stringify(loader.current.report)) : null });
  };

  useEffect(() => {
    (window as unknown as { __veloxAssemblyMemory?: () => { geometries: number; textures: number } }).__veloxAssemblyMemory = () => ({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures });
  }, [gl]);

  // Selection / pending / hover highlighting and paint.
  const applyStyle = () => {
    const paint = paintColor && /^#[0-9a-fA-F]{6}$/.test(paintColor) ? new THREE.Color(paintColor) : null;
    const pendingSet = new Set(pendingSlots);
    live.current.forEach((l, id) => {
      const slot = slotOf.get(id) ?? null;
      l.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (paint && PAINTED_NODES.has(id) && (mesh.userData.role === "paint_primary" || mesh.userData.role === "paint_secondary" || mesh.userData.role === "carbon")) m.color.copy(paint);
        if (slot && slot === selectedSlot) {
          m.emissive.copy(SELECTED);
          m.emissiveIntensity = 0.5;
        } else if (slot && pendingSet.has(slot)) {
          m.emissive.copy(PENDING);
          m.emissiveIntensity = 0.22;
        } else if (slot && slot === hoveredSlot) {
          m.emissive.copy(HOVER);
          m.emissiveIntensity = 0.12;
        } else {
          m.emissive.setRGB(0, 0, 0);
          m.emissiveIntensity = 0;
        }
      });
    });
    invalidate();
  };
  // Reconcile scene nodes with the spec.
  useEffect(() => {
    loader.current ??= new AssetLoader(baseUrl, gl, () => publish(), enableKtx2);
    const root = group.current!;
    const wanted = new Map(spec.nodes.map((n) => [n.id, n]));
    for (const [id, l] of [...live.current]) {
      const n = wanted.get(id);
      if (!n || sourceSignature(n) !== l.sig) {
        root.remove(l.object);
        l.release();
        live.current.delete(id);
        delete geometry.current[id];
      }
    }
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
      const holder = new THREE.Group();
      holder.userData.veloxNode = n.id;
      place(n, holder);
      root.add(holder);
      if (n.source!.kind === "generator") {
        const parts = GENERATORS[n.source!.generator].build(n.source!.params);
        for (const p of parts) {
          const style = ROLE_COLOR[p.role] ?? ROLE_COLOR.metal!;
          const m = new THREE.Mesh(p.geometry, new THREE.MeshStandardMaterial({ ...style }));
          m.name = p.name;
          m.userData.role = p.role;
          holder.add(m);
        }
        geometry.current[n.id] = geometryFingerprint(parts.map((p) => ({ name: p.name, positions: p.geometry.getAttribute("position").array, indices: p.geometry.getIndex()?.array ?? null })));
        live.current.set(n.id, {
          sig,
          object: holder,
          release: () =>
            holder.children.forEach((c) => {
              (c as THREE.Mesh).geometry.dispose();
              ((c as THREE.Mesh).material as THREE.Material).dispose();
            }),
        });
        continue;
      }
      const src = n.source as Extract<NonNullable<AssemblyNode["source"]>, { kind: "asset" }>;
      const entry = manifest.get(`${src.key}@${src.version}`);
      if (!entry) {
        errors.current.push(`${n.id}: ${src.key}@${src.version} is not in the verified manifest`);
        root.remove(holder);
        continue;
      }
      pending.current++;
      const ticket: Live = { sig, object: holder, release: () => undefined };
      live.current.set(n.id, ticket);
      void loader.current!.acquire(entry).then(
        (obj) => {
          pending.current--;
          if (live.current.get(n.id) !== ticket) {
            loader.current!.release(entry, obj);
          } else {
            obj.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (mesh.isMesh) mesh.userData.role = entry.materials[(mesh.material as THREE.Material).name] ?? null;
            });
            holder.add(obj);
            geometry.current[n.id] = fingerprintObject(obj);
            ticket.release = () => loader.current!.release(entry, obj);
          }
          applyStyle();
          invalidate();
          publish();
        },
        (e: unknown) => {
          pending.current--;
          if (live.current.get(n.id) === ticket) {
            live.current.delete(n.id);
            root.remove(holder);
          }
          errors.current.push(`${n.id}: ${e instanceof Error ? e.message : String(e)}`);
          publish();
        },
      );
    }
    applyStyle();
    invalidate();
    publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(applyStyle, [selectedSlot, hoveredSlot, pendingSlots, paintColor, slotOf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      live.current.forEach((l) => l.release());
      live.current.clear();
      loader.current?.dispose();
    },
    [live],
  );

  const nodeOf = (o: THREE.Object3D | null): string | null => {
    for (let x = o; x; x = x.parent) if (x.userData.veloxNode) return x.userData.veloxNode as string;
    return null;
  };
  const slotFromEvent = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const id = nodeOf(e.object);
    return id ? (slotOf.get(id) ?? null) : null;
  };

  return (
    <group
      ref={group}
      onPointerMove={interactive ? (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), props.onHoverSlot?.(slotFromEvent(e))) : undefined}
      onPointerOut={interactive ? () => props.onHoverSlot?.(null) : undefined}
      onClick={interactive ? (e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), e.delta <= 4 && props.onSelectSlot?.(slotFromEvent(e))) : undefined}
    />
  );
}

function Rig({ presets, presetId, nonce, focus }: { presets: AssemblyPreset[]; presetId?: string; nonce?: number; focus: [number, number, number] | null }) {
  const ref = useRef<CameraControls>(null);
  useEffect(() => {
    const p = presets.find((x) => x.id === presetId) ?? presets[0];
    if (p) void ref.current?.setLookAt(...p.position, ...p.target, (nonce ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, nonce]);
  useEffect(() => {
    if (focus) void ref.current?.setTarget(...focus, true);
  }, [focus]);
  return <CameraControls ref={ref} makeDefault minDistance={0.3} maxDistance={6} maxPolarAngle={Math.PI / 2 + 0.15} smoothTime={0.35} dollyToCursor />;
}

export function AssemblyCanvas(props: AssemblyCanvasProps) {
  const presets = useMemo(() => computePresets(props.spec), [props.spec]);
  const liveRef = useRef(new Map<string, Live>());
  const focus = useMemo<[number, number, number] | null>(() => {
    if (!props.selectedSlot) return null;
    const n = props.spec.nodes.find((x) => x.slot === props.selectedSlot && x.world);
    if (!n?.world) return null;
    const pts = Object.values(n.anchorsWorld);
    if (n.source?.kind === "generator" && n.id === "chain") return presets[0]?.target ?? null;
    const c = pts.length ? pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]) : n.world.t;
    return c as [number, number, number];
  }, [props.selectedSlot, props.spec, presets]);
  const initial = presets[0];
  return (
    <Canvas
      className={props.className}
      data-testid="assembly-canvas"
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      camera={{ position: initial?.position ?? [1.2, 0.9, 2.2], fov: 32, near: 0.05, far: 40 }}
      onPointerMissed={() => props.interactive !== false && props.onSelectSlot?.(null)}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.4} />
      <directionalLight position={[-3, 2.5, -2]} intensity={0.5} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[4, 1, 2]} rotation-y={-Math.PI / 3} scale={[3, 2, 1]} />
      </Environment>
      <Scene {...props} presets={presets} liveRef={liveRef} />
      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={3.4} blur={2.4} far={1.2} resolution={512} frames={1} />
      <Rig presets={presets} presetId={props.presetId} nonce={props.presetNonce} focus={focus} />
    </Canvas>
  );
}
