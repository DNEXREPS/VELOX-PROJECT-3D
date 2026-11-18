"use client";

/** True when the browser can create a WebGL2 (or WebGL1) context. */
export function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const ok = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/** Heuristic for constrained devices: used to cap pixel ratio and effects. */
export function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (coarse && cores <= 4) || memory <= 2;
}
