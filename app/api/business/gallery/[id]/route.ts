import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { galleryPatch, itemId } from "@/lib/content-schema";
import { deleteBlobsAfterWrite } from "@/lib/blob-objects";

export const dynamic = "force-dynamic";

/** PATCH /api/business/gallery/<id> — caption/reorder only; the image URL
 * itself is immutable (replacing an image = delete + upload new; keeps the
 * blob bookkeeping trivially auditable). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;
  const idParsed = itemId.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const parsed = galleryPatch.safeParse({ ...asObject(body), id: idParsed.data });
  if (!parsed.success) return validationError(parsed.error);

  const { id: _id, ...fields } = parsed.data;
  void _id;
  const done = await prisma.galleryImage.updateMany({ where: { id: parsed.data.id, businessId: ctx.businessId }, data: fields });
  if (done.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE — row first, blob after. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;
  const idParsed = itemId.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const before = (await prisma.galleryImage.findFirst({
    where: { id: idParsed.data, businessId: ctx.businessId },
    select: { id: true, url: true },
  })) as { id: string; url: string } | null;
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const done = await prisma.galleryImage.deleteMany({ where: { id: before.id, businessId: ctx.businessId } });
  if (done.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteBlobsAfterWrite([before.url], "gallery");
  return NextResponse.json({ ok: true });
}

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
