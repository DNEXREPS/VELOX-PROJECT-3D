import { describe, expect, it } from "vitest";
import { MAX_IMAGE_SIDE, readImageDimensions, validateImageFile } from "@/lib/uploads";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const png = (w: number, h: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const jpeg = (w: number, h: number) =>
  new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, // APP0 (16 bytes)
    0xff, 0xdb, 0x00, 0x04, 0, 0, // tiny DQT segment
    0xff, 0xc2, 0x00, 0x11, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, // progressive SOF2
  ]);
const webpHeader = (chunk: string, body: number[]) => new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(chunk), 0, 0, 0, 0, ...body, ...new Array(16).fill(0)]);
const webpVp8x = (w: number, h: number) => webpHeader("VP8X", [0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
const webpVp8l = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return webpHeader("VP8L", [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
};
const webpVp8 = (w: number, h: number) => webpHeader("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)]);

describe("image dimension checks", () => {
  it("reads dimensions from PNG, JPEG (incl. progressive) and all WebP variants", () => {
    expect(readImageDimensions(png(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions(jpeg(1920, 1080), "image/jpeg")).toEqual({ width: 1920, height: 1080 });
    expect(readImageDimensions(webpVp8x(800, 600), "image/webp")).toEqual({ width: 800, height: 600 });
    expect(readImageDimensions(webpVp8l(100, 50), "image/webp")).toEqual({ width: 100, height: 50 });
    expect(readImageDimensions(webpVp8(320, 240), "image/webp")).toEqual({ width: 320, height: 240 });
  });

  it("accepts normal photos", async () => {
    for (const bytes of [png(4000, 3000), jpeg(6000, 4000), webpVp8x(2048, 2048)]) {
      expect((await validateImageFile(new Blob([bytes]), 1024 * 1024)).ok).toBe(true);
    }
  });

  it("rejects decompression bombs (huge dimensions in a tiny file)", async () => {
    for (const bytes of [png(50_000, 50_000), jpeg(MAX_IMAGE_SIDE + 1, 10), webpVp8x(7000, 7000)]) {
      const r = await validateImageFile(new Blob([bytes]), 1024 * 1024);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/too large/);
    }
  });

  it("rejects truncated or malformed images whose header cannot be read", async () => {
    const truncatedPng = png(10, 10).slice(0, 14);
    const zeroSize = png(0, 10);
    const brokenJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
    for (const bytes of [truncatedPng, zeroSize, brokenJpeg]) {
      expect((await validateImageFile(new Blob([bytes]), 1024)).ok).toBe(false);
    }
  });

  it("still ignores the client-declared type and name", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await validateImageFile(new File([svg], "photo.png", { type: "image/png" }), 1024)).ok).toBe(false);
  });
});
