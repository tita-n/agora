import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { galleryInput } from "@/lib/content-schema";
import { MAX_GALLERY_IMAGES } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** POST /api/business/gallery — one uploaded image (URL must be ours). */
export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const createSchema = galleryInput.omit({ sortOrder: true });
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const count = await prisma.galleryImage.count({ where: { businessId: ctx.businessId } });
  if (count >= MAX_GALLERY_IMAGES) {
    // the upload already happened (that's how the flow works) — clean the
    // orphan immediately, the cap is the only reason this can occur
    const { deleteBlobsAfterWrite } = await import("@/lib/blob-objects");
    await deleteBlobsAfterWrite([parsed.data.url], "gallery-cap");
    return NextResponse.json({ error: `Gallery limit reached (${MAX_GALLERY_IMAGES}).` }, { status: 409 });
  }
  const top = (await prisma.galleryImage.findFirst({
    where: { businessId: ctx.businessId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })) as { sortOrder: number } | null;

  const created = await prisma.galleryImage.create({
    data: { ...parsed.data, sortOrder: top ? top.sortOrder + 1 : 0, businessId: ctx.businessId },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
