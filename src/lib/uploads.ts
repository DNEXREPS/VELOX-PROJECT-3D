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

export type UploadCheck = { ok: true; mime: ImageMime; bytes: Uint8Array } | { ok: false; error: string };

export async function validateImageFile(file: unknown, maxBytes: number): Promise<UploadCheck> {
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  if (file.size > maxBytes) return { ok: false, error: `Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageType(bytes);
  if (!mime) return { ok: false, error: "Only JPEG, PNG or WebP images are allowed." };
  return { ok: true, mime, bytes };
}
