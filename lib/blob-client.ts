import { upload } from "@vercel/blob/client";

/**
 * Uploads a logo file to Vercel Blob storage via the client-side upload flow.
 * The server route (/api/blob/token) enforces the path prefix, size, and
 * content type; this client mirrors that so we fail fast instead of 403-ing.
 *
 * The pathname is built from the signed-in user's id + a timestamp — the
 * original file name is deliberately NOT used (client-controlled names must
 * never reach the blob path).
 */

const MAX_BYTES = 2 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadLogo(
  userId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      return { url: null, error: "Only PNG, JPEG, or WebP images are allowed" };
    }
    if (file.size > MAX_BYTES) {
      return { url: null, error: "File exceeds the 2 MB limit" };
    }

    const pathname = `logos/${userId}/${Date.now()}.${ext}`;
    const result = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/blob/token",
      // Fail fast instead of hanging on an interrupted connection (M-12).
      abortSignal: AbortSignal.timeout(60_000),
    });
    return { url: result.url, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}
