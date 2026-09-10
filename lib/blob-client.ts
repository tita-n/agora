import { upload } from "@vercel/blob/client";

/**
 * Uploads a logo file to Vercel Blob storage via the client-side upload flow.
 * Returns the public URL of the uploaded blob.
 */
export async function uploadLogo(file: File): Promise<{ url: string | null; error: string | null }> {
  try {
    const pathname = `logos/${Date.now()}-${file.name.replace(/\s+/g, "-").toLowerCase()}`;
    const result = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/blob/token",
      onUploadProgress: (progress) => {
        console.log(`Upload progress: ${progress.percentage}%`);
      },
    });
    return { url: result.url, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}
