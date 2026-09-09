import { NextResponse } from "next/server";
import { createServerClient } from "@vercel/blob";

/**
 * Issues a short-lived upload token for client-side Vercel Blob uploads.
 * The browser calls this, then streams bytes directly to Vercel Blob.
 */
export async function POST() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 500 }
    );
  }

  const blob = createServerClient(token);
  const { url, token: uploadToken } = await blob.generateClientToken();

  return NextResponse.json({ url, token: uploadToken });
}