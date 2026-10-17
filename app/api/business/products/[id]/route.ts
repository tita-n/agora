import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { productInput, itemId } from "@/lib/content-schema";
import { deleteBlobsAfterWrite } from "@/lib/blob-objects";

export const dynamic = "force-dynamic";

const patchSchema = productInput.omit({ sortOrder: true }).partial().strict();

type ProductRow = { id: string; imageUrls: string[] };

/**
 * PATCH /api/business/products/<id> — edit one product. The WHERE clause is
 * { id, businessId }: another owner's id (or a forged one) matches zero
 * rows → 404, never an update (IDOR rule). Image bookkeeping: the row is
 * written FIRST, then images that fell out of the list are deleted from the
 * blob store (never orphaned, and a failed delete can't lose user data).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;
  const idParsed = itemId.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const before = (await prisma.product.findFirst({
    where: { id: idParsed.data, businessId: ctx.businessId },
    select: { id: true, imageUrls: true },
  })) as ProductRow | null;
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.product.updateMany({ where: { id: before.id, businessId: ctx.businessId }, data: parsed.data });

  if (parsed.data.imageUrls) {
    const kept = new Set(parsed.data.imageUrls);
    const dropped = before.imageUrls.filter((u) => !kept.has(u));
    await deleteBlobsAfterWrite(dropped, "products");
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE — row first, then its blobs. A product row vanishing while a blob
 * delete fails is fine (the file is then unreferenced but invisible); the
 * reverse (404'd row, live image billed forever) is what we design against.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;
  const idParsed = itemId.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const before = (await prisma.product.findFirst({
    where: { id: idParsed.data, businessId: ctx.businessId },
    select: { id: true, imageUrls: true },
  })) as ProductRow | null;
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gone = await prisma.product.deleteMany({ where: { id: before.id, businessId: ctx.businessId } });
  if (gone.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteBlobsAfterWrite(before.imageUrls, "products");
  return NextResponse.json({ ok: true });
}
