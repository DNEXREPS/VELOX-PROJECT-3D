"use client";
/**
 * Feature switch + verified manifest loading for the modular assembly engine.
 *
 *  - NEXT_PUBLIC_ASSEMBLY_ENGINE=1 makes the modular viewer available and the default.
 *  - When enabled, each viewer can switch back to the classic viewer; the choice is
 *    remembered per browser (localStorage, best effort). When disabled, the studio is
 *    exactly the pre-P1 experience.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AssetManifest } from "@/lib/assembly/spec";
import { fetchVerified } from "./asset-loader";

export const ENGINE_ENABLED = process.env.NEXT_PUBLIC_ASSEMBLY_ENGINE === "1";

export type ViewerChoice = "modular" | "classic";
const KEY = "velox.studio.viewer";
const listeners = new Set<() => void>();

function readChoice(): ViewerChoice {
  try {
    return window.localStorage.getItem(KEY) === "classic" ? "classic" : "modular";
  } catch {
    return "modular";
  }
}

export function setViewerChoice(choice: ViewerChoice) {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  memory = choice;
  listeners.forEach((l) => l());
}
let memory: ViewerChoice | null = null;

export function useViewerChoice(): ViewerChoice {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => memory ?? readChoice(),
    () => "modular",
  );
}

export interface ManifestRef {
  baseUrl: string;
  file: string;
  sha256: string;
}

/** Load the immutable manifest and verify its SHA-256 against the server-provided pointer. */
export function useVerifiedManifest(ref: ManifestRef | null) {
  const [state, setState] = useState<{ manifest: AssetManifest | null; error: string | null }>({ manifest: null, error: null });
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    fetchVerified(ref.baseUrl + ref.file, ref.sha256)
      .then((buf) => alive && setState({ manifest: JSON.parse(new TextDecoder().decode(buf)) as AssetManifest, error: null }))
      .catch((e: unknown) => alive && setState({ manifest: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [ref?.baseUrl, ref?.file, ref?.sha256]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
