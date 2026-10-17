import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, validationError, parseBody } from "@/lib/owner-api";
import { reorderInput } from "@/lib/content-schema";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/business/reorder  { kind, ids } — full desired order of the
 * owner's item ids (up/down buttons send the whole list; simple, atomic
 * enough at these caps, and immune to two-tab races because each write is
 * scoped { id, businessId }). Ids not owned by this business are silently
 * ignored — the response tells you how many moved, and "0 moved" is the
 * honest signal that a foreign/stale id was aimed at you.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const parsed = reorderInput.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  // The per-model delegates have incompatible generic signatures, so the
  // union `prisma.product | prisma.service | ...` is NOT callable as one
  // `findMany`/`updateMany` (real Prisma types reject that; a stubbed any-
  // typed client hides it). Every model here only ever needs the same two
  // shape-compatible operations, so narrow through an explicit structural
  // contract instead of hoping the union unifies.
  type ReorderDelegate = {
    findMany: (args: {
      where: { businessId: string };
      select: { id: true; sortOrder: true };
    }) => Promise<{ id: string; sortOrder: number }[]>;
    updateMany: (args: {
      where: { id: string; businessId: string };
      data: { sortOrder: number };
    }) => Promise<unknown>;
  };
  const delegate = {
    products: prisma.product,
    services: prisma.service,
    gallery: prisma.galleryImage,
    testimonials: prisma.testimonial,
  }[parsed.data.kind as "products" | "services" | "gallery" | "testimonials"] as unknown as ReorderDelegate;

  const owned = await delegate.findMany({
    where: { businessId: ctx.businessId },
    select: { id: true, sortOrder: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));

  let moved = 0;
  for (let i = 0; i < parsed.data.ids.length; i++) {
    const id = parsed.data.ids[i];
    if (!ownedIds.has(id)) continue;
    const current = owned.find((o) => o.id === id);
    if (current && current.sortOrder === i) continue;
    await delegate.updateMany({ where: { id, businessId: ctx.businessId }, data: { sortOrder: i } });
    moved++;
  }
  return NextResponse.json({ ok: true, moved });
}
