import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Upload-completion callback (finding M-9).
 *
 * Vercel Blob POSTs here after a client upload finishes. There is no
 * session on this request — it comes from Vercel, not the browser — so
 * authenticity relies on handleUpload's signature verification: the SDK
 * requires an `x-vercel-signature` header and HMAC-verifies the full body
 * against the read-write token before onUploadCompleted runs. Anything
 * forged fails verification and never touches the database.
 *
 * This route must NOT be able to issue upload tokens; that stays gated by
 * session in /api/blob/token.
 */
export async function POST(req: NextRequest) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const data = await handleUpload({
      request: req,
      body,
      // Not supported on this route — token issuance lives in /api/blob/token.
      onBeforeGenerateToken: async () => {
        throw new Error("Token issuance is not allowed on this route");
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return; // nothing to attribute it to
        let userId: string | undefined;
        let businessId: string | undefined;
        try {
          ({ userId, businessId } = JSON.parse(tokenPayload) as {
            userId?: string;
            businessId?: string;
          });
        } catch {
          return; // malformed payload from our own token — ignore defensively
        }
        if (!userId || !businessId) return;
        // Defense in depth: the blob must live under the uploading user's prefix.
        if (!blob.pathname.startsWith(`logos/${userId}/`)) return;

        // Read the superseded URL FIRST (before overwriting it).
        const previous = await prisma.business.findUnique({
          where: { id: businessId },
          select: { logoUrl: true },
        });

        await prisma.business.update({
          where: { id: businessId },
          data: { logoUrl: blob.url },
        });

        // Cleanup runs strictly AFTER the new logo is persisted: if the new
        // upload had failed we never get here, so a failed re-upload can
        // never leave the business logo-less. First upload (no previous) is
        // simply a no-op.
        const old = previous?.logoUrl;
        if (old && old !== blob.url && /\.public\.blob\.vercel-storage\.com\/|\.blob\.vercel-storage\.com\//.test(old)) {
          try {
            await del(old);
          } catch (err) {
            // Orphaned-but-harmless: the site is correct (points at the new
            // blob); only storage is dirtied. Log for a sweep, don't fail the
            // callback (a retry would not delete it any better).
            console.warn(
              `[blob-cleanup] could not delete superseded logo for business ${businessId}:`,
              err instanceof Error ? err.message : err
            );
          }
        }
      },
    });
    return NextResponse.json(data);
  } catch {
    // Missing/invalid signature or unsupported event type.
    return NextResponse.json({ error: "Invalid callback" }, { status: 401 });
  }
}
