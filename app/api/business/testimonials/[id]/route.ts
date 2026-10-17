import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { testimonialInput, itemId } from "@/lib/content-schema";

export const dynamic = "force-dynamic";

const patchSchema = testimonialInput.omit({ sortOrder: true }).partial().strict();

/** PATCH /api/business/testimonials/<id> */
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

  const done = await prisma.testimonial.updateMany({ where: { id: idParsed.data, businessId: ctx.businessId }, data: parsed.data });
  if (done.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/business/testimonials/<id> */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;
  const idParsed = itemId.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const done = await prisma.testimonial.deleteMany({ where: { id: idParsed.data, businessId: ctx.businessId } });
  if (done.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
