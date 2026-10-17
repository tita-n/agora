import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { serviceInput } from "@/lib/content-schema";
import { MAX_SERVICES } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** POST /api/business/services — create a service (see products route for
 * the shared reasoning: session-scoped business, strict schema, append). */
export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const createSchema = serviceInput.omit({ sortOrder: true });
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const count = await prisma.service.count({ where: { businessId: ctx.businessId } });
  if (count >= MAX_SERVICES) {
    return NextResponse.json({ error: `Service limit reached (${MAX_SERVICES}).` }, { status: 409 });
  }
  const top = (await prisma.service.findFirst({
    where: { businessId: ctx.businessId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })) as { sortOrder: number } | null;

  const created = await prisma.service.create({
    data: { ...parsed.data, sortOrder: top ? top.sortOrder + 1 : 0, businessId: ctx.businessId },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
