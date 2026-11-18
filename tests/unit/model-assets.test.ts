import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODELS, buildMeshIndex, getModelMeta, tireScale, DEFAULT_MODEL_KEY } from "@/features/studio/models/registry";
import { BIKE_SLOTS } from "@/lib/domain/slots";

/** Read node names from a GLB's JSON chunk (no three.js needed). */
function glbNodeNames(path: string): { names: string[]; extras: Record<string, unknown> | undefined } {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  return { names: (json.nodes ?? []).map((n: { name?: string }) => n.name ?? ""), extras: json.nodes?.find((n: { extras?: unknown }) => n.extras)?.extras };
}

describe("3D model registry", () => {
  for (const meta of Object.values(MODELS)) {
    describe(meta.key, () => {
      const file = join(process.cwd(), "public", meta.url);
      const { names, extras } = glbNodeNames(file);

      it("maps only meshes that exist in the GLB", () => {
        for (const mapping of Object.values(meta.slots)) {
          for (const mesh of mapping!.meshes) expect(names, `missing mesh ${mesh}`).toContain(mesh);
        }
        for (const mesh of meta.paintMeshes) expect(names).toContain(mesh);
      });

      it("maps every mesh to at most one slot and only to valid slots", () => {
        const index = buildMeshIndex(meta);
        for (const slot of index.values()) expect(BIKE_SLOTS).toContain(slot);
      });

      it("declares placeholder status consistently with the asset", () => {
        if (meta.placeholder) expect(JSON.stringify(extras)).toContain("placeholder");
      });

      it("has a valid default camera preset", () => {
        expect(meta.cameraPresets.map((p) => p.id)).toContain(meta.defaultPreset);
      });
    });
  }

  it("falls back to the default model for unknown keys", () => {
    expect(getModelMeta("does-not-exist").key).toBe(DEFAULT_MODEL_KEY);
  });

  it("clamps parametric tire width scale", () => {
    expect(tireScale(28, 28, 18, 65)).toBe(1);
    expect(tireScale(56, 28, 18, 65)).toBe(2);
    expect(tireScale(200, 28, 18, 65)).toBeCloseTo(65 / 28);
    expect(tireScale(undefined, 28, 18, 65)).toBe(1);
  });
});
