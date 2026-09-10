/**
 * Client-side upload placeholder.
 * TODO Phase 1: integrate real @vercel/blob/client upload.
 */
export async function uploadLogo(_file: File): Promise<{
  url: string | null;
  error: string | null;
}> {
  return {
    url: null,
    error: "Blob upload not yet implemented (Phase 0 placeholder)",
  };
}
