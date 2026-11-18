"use client";
import { useEffect, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { BikeModelMeta, CameraPreset } from "../models/types";
import type { BikeSlot } from "@/lib/domain/slots";

export interface CameraCommand {
  presetId: string;
  nonce: number;
}

interface Props {
  meta: BikeModelMeta;
  command: CameraCommand;
  focusSlot: BikeSlot | null;
  autoRotate: boolean;
}

function presetFor(meta: BikeModelMeta, id: string): CameraPreset {
  return meta.cameraPresets.find((p) => p.id === id) ?? meta.cameraPresets[0];
}

export function CameraRig({ meta, command, focusSlot, autoRotate }: Props) {
  const ref = useRef<CameraControls>(null);
  const interacting = useRef(false);

  // Presets / reset (smooth transitions).
  useEffect(() => {
    const p = presetFor(meta, command.presetId);
    void ref.current?.setLookAt(...p.position, ...p.target, command.nonce > 0);
  }, [meta, command]);

  // Focus selected component.
  useEffect(() => {
    if (!focusSlot) return;
    const focus = meta.slots[focusSlot]?.focus;
    if (focus) void ref.current?.setTarget(focus[0], focus[1], focus[2], true);
  }, [focusSlot, meta]);

  useFrame((_, delta) => {
    if (autoRotate && ref.current && !interacting.current) ref.current.azimuthAngle += delta * 0.18;
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={0.35}
      maxDistance={5}
      maxPolarAngle={Math.PI / 2 + 0.2}
      smoothTime={0.35}
      dollyToCursor
      onStart={() => (interacting.current = true)}
      onEnd={() => (interacting.current = false)}
    />
  );
}
