import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext } from "@/lib/owner-api";
import { deleteBlobsAfterWrite } from "@/lib/blob-objects";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/business/logo — remove the logo (Minimal + every theme render
 * without it; that's long-tested). The blob goes after the row is cleared.
 * Replacing a logo needs none of this: the upload-completion callback already
 * deletes the superseded file (Phase 2 behaviour, untouched).
 */
export async function DELETE(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const before = (await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: { logoUrl: true },
  })) as { logoUrl: string | null } | null;
  if (!before?.logoUrl) return NextResponse.json({ ok: true, already: true });

  await prisma.business.update({ where: { id: ctx.businessId }, data: { logoUrl: null } });
  await deleteBlobsAfterWrite([before.logoUrl], "logo");
  return NextResponse.json({ ok: true });
}
