import { IMAGE_MIME } from "@/lib/validation/schemas";

export type ImageMime = (typeof IMAGE_MIME)[number];

/**
 * Detect the real image type from magic bytes. The client-declared MIME type and
 * file extension are NOT trusted.
 */
export function detectImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export const EXTENSION: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Decompression-bomb protection: a 5 MB file can still decode to gigabytes of pixels. */
export const MAX_IMAGE_SIDE = 8000;
export const MAX_IMAGE_PIXELS = 40_000_000;

export interface ImageDimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Read pixel dimensions from the image header without decoding it. */
export function readImageDimensions(bytes: Uint8Array, mime: ImageMime): ImageDimensions | null {
  if (mime === "image/png") {
    // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4)
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (mime === "image/webp") {
    if (bytes.length < 30) return null;
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === "VP8X") return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const b = bytes.subarray(21, 25);
      return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    }
    return null;
  }
  // JPEG: walk the marker segments to the first Start-Of-Frame.
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = u16be(bytes, i + 2);
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
    i += 2 + length;
  }
  return null;
}

export function checkImageDimensions(dim: ImageDimensions | null): string | null {
  if (!dim || dim.width < 1 || dim.height < 1) return "The image appears to be damaged or incomplete.";
  if (dim.width > MAX_IMAGE_SIDE || dim.height > MAX_IMAGE_SIDE || dim.width * dim.height > MAX_IMAGE_PIXELS) {
    return `Image dimensions are too large (max ${MAX_IMAGE_SIDE} px per side).`;
  }
  return null;
}

export type UploadCheck = { ok: true; mime: ImageMime; bytes: Uint8Array; dimensions: ImageDimensions } | { ok: false; error: string };

export async function validateImageFile(file: unknown, maxBytes: number): Promise<UploadCheck> {
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  if (file.size > maxBytes) return { ok: false, error: `Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageType(bytes);
  if (!mime) return { ok: false, error: "Only JPEG, PNG or WebP images are allowed." };
  const dimensions = readImageDimensions(bytes, mime);
  const dimensionError = checkImageDimensions(dimensions);
  if (dimensionError || !dimensions) return { ok: false, error: dimensionError ?? "The image appears to be damaged or incomplete." };
  return { ok: true, mime, bytes, dimensions };
}
