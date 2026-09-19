import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payouts/mark-paid  { id }
 *
 * The manual half of the payout flow, on purpose: money moves by bank
 * transfer OUTSIDE the platform (same trust model as business payment
 * confirmation — you check your own bank records and click). This endpoint
 * only records that fact. Optimistic status flip (updateMany WHERE
 * status="owed") makes double-clicks/races 409, never double-pays.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let id: string;
  try {
    id = String((await req.json() as { id?: unknown }).id ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const payout = await prisma.devPayout.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!payout) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

  const claimed = await prisma.devPayout.updateMany({
    where: { id: payout.id, status: "owed" },
    data: { status: "paid", paidAt: new Date(), paidById: user.id },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ error: "Payout was already paid" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
