import { handleUpload } from "@vercel/blob/client";
import { NextRequest } from "next/server";

/**
 * Client-upload token handler.
 * The @vercel/blob/client upload() function calls this route to get a client token
 * before uploading directly to Vercel Blob storage.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();

  const data = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (_pathname, _clientPayload, _multipart) => {
      // Called before generating the client token. Return any token options here.
      return {};
    },
    // onUploadCompleted removed for Phase 0 — would store blob URL in DB
  });

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
