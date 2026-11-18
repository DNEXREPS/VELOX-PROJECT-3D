"use client";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import type { BikeModelMeta } from "../models/types";
import type { BikeSlot } from "@/lib/domain/slots";
import { BikeModel, type BikeModelVisualState } from "./BikeModel";
import { CameraRig, type CameraCommand } from "./CameraRig";

interface Props extends BikeModelVisualState {
  meta: BikeModelMeta;
  interactive: boolean;
  autoRotate: boolean;
  camera: CameraCommand;
  focusOnSelect: boolean;
  shadows: boolean;
  onHover: (slot: BikeSlot | null) => void;
  onSelect: (slot: BikeSlot | null) => void;
}

/** Studio lighting is fully local (Lightformers) — no external HDR downloads. */
export function BikeScene({ meta, interactive, autoRotate, camera, focusOnSelect, shadows, onHover, onSelect, ...visual }: Props) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.4} />
      <directionalLight position={[-3, 2.5, -2]} intensity={0.5} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[4, 1, 2]} rotation-y={-Math.PI / 3} scale={[3, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-4, 1, -2]} rotation-y={Math.PI / 3} scale={[3, 2, 1]} />
      </Environment>
      <BikeModel meta={meta} interactive={interactive} onHover={onHover} onSelect={onSelect} {...visual} />
      {shadows && <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={3.2} blur={2.4} far={1.2} resolution={512} frames={1} color="#000000" />}
      <CameraRig meta={meta} command={camera} focusSlot={focusOnSelect ? visual.selectedSlot : null} autoRotate={autoRotate} />
    </>
  );
}
