import { NextResponse } from "next/server";

/**
 * Placeholder upload token route.
 * TODO Phase 1: integrate real Vercel Blob client token generation.
 */
export async function POST() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 500 }
    );
  }

  // Placeholder: real implementation will use @vercel/blob's token API
  return NextResponse.json({
    url: "https://placeholder.vercel-storage.com",
    token: "placeholder-upload-token",
  });
}
