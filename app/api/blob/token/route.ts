import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { prisma } from "@/lib/prisma";

/**
 * Client-upload token handler (finding C-1, AUDIT.md).
 *
 * The browser's upload() call hits this route to get a short-lived,
 * signed client token. The token is constrained server-side:
 *  - caller must have an active session
 *  - upload path must be inside the caller's own <kind>/<userId>/ prefix
 *  - only small PNG/JPEG/WebP images may be uploaded
 *  - the token expires after 15 minutes
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
/**
 * Phase 2.5: tenant image uploads come in three kinds —
 *   logos/<userId>/…    the profile logo (existing; the completion callback
 *                       persists Business.logoUrl for this prefix ONLY)
 *   products/<userId>/… product images (persisted by the product write)
 *   gallery/<userId>/…  gallery images (persisted by the gallery write)
 * Same shape rule as before: kind + the CALLER'S OWN userId + a filename
 * that cannot traverse (no slashes beyond the fixed segments).
 */
const PATH_RE = /^(logos|products|gallery)\/[a-z0-9]{10,32}\/[\w.-]+\.(png|jpe?g|webp)$/i;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      onBeforeGenerateToken: async (pathname) => {
        const m = PATH_RE.exec(pathname);
        if (!m || !pathname.startsWith(`${m[1]}/${userId}/`)) {
          throw new Error("Invalid upload path");
        }
        // Resolve the upload's destination business server-side; Phase 1
        // assumes one business per owner. When present it goes into the
        // signed tokenPayload so the completion callback (M-9) can persist
        // the blob URL without trusting anything client-sent. An owner still
        // in onboarding has no Business row yet — uploads stay allowed
        // (same user prefix, same limits); the completion callback skips
        // persistence and the draft keeps the returned URL.
        const business = await prisma.business.findFirst({
          where: { ownerId: userId },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        return {
          tokenPayload: JSON.stringify({
            userId,
            businessId: business?.id ?? null,
          }),
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 15 * 60 * 1000,
          callbackUrl: `${req.nextUrl.origin}/api/blob/upload-completed`,
        };
      },
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Could not issue upload token" }, { status: 403 });
  }
}
