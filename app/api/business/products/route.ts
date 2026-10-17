import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { productInput } from "@/lib/content-schema";
import { MAX_PRODUCTS } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/business/products — create a product for the SESSION's business.
 * businessId comes from the session (never the client); the payload goes
 * through productInput (lengths, kobo >= 0, blob-only image URLs, caps).
 * New products append to the end of the owner's ordering regardless of any
 * sortOrder the client tries to send — ordering is owned by /reorder.
 */
export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;

  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const createSchema = productInput.omit({ sortOrder: true });
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const count = await prisma.product.count({ where: { businessId: ctx.businessId } });
  if (count >= MAX_PRODUCTS) {
    return NextResponse.json({ error: `Product limit reached (${MAX_PRODUCTS}). Remove something first.` }, { status: 409 });
  }
  const top = (await prisma.product.findFirst({
    where: { businessId: ctx.businessId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })) as { sortOrder: number } | null;

  const product = await prisma.product.create({
    // ordering is the /reorder endpoint's job — a create can never smuggle
    // a position; new items land at the end
    data: { ...parsed.data, sortOrder: top ? top.sortOrder + 1 : 0, businessId: ctx.businessId },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: product.id });
}
