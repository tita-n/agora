import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { testimonialInput } from "@/lib/content-schema";
import { MAX_TESTIMONIALS } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** POST /api/business/testimonials */
export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const createSchema = testimonialInput.omit({ sortOrder: true });
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const count = await prisma.testimonial.count({ where: { businessId: ctx.businessId } });
  if (count >= MAX_TESTIMONIALS) {
    return NextResponse.json({ error: `Testimonial limit reached (${MAX_TESTIMONIALS}).` }, { status: 409 });
  }
  const top = (await prisma.testimonial.findFirst({
    where: { businessId: ctx.businessId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })) as { sortOrder: number } | null;

  const created = await prisma.testimonial.create({
    data: { ...parsed.data, sortOrder: top ? top.sortOrder + 1 : 0, businessId: ctx.businessId },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
