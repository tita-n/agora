import { upload } from "@vercel/blob/client";

interface UploadResult {
  url: string | null;
  error: string | null;
}

/**
 * Client-side upload helper used by the dashboard logo smoke test.
 * Bytes go directly from the browser to Vercel Blob — no server proxy.
 * The SDK fetches a short-lived token from /api/blob/token first.
 */
export async function uploadLogo(file: File): Promise<UploadResult> {
  try {
    const result = await upload(file, "/logos", {
      access: "public",
      handleUploadUrl: "/api/blob/token",
      handleUpload: async (filename, _size, _type) => {
        return `${filename}-${Date.now()}`;
      },
    });
    return { url: result.url, error: null };
  } catch (err: any) {
    return { url: null, error: err?.message || "Upload failed" };
  }
}