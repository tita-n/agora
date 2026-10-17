import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const rejectSchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, "Give the payer a concrete reason (they'll see this)")
    .max(200),
});

/**
 * POST /api/admin/payments/reject  { id, reason }
 *
 * For transfers that never arrive or don't match. Rejecting a signup
 * payment also fails its OnboardingSession so the subdomain hold is
 * released immediately (the picker becomes honest without waiting for the
 * 24h expiry). The payer sees the reason via PendingPayment.rejectReason.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = rejectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "id + reason (3–200 chars) required", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { id, reason } = parsed.data;

  const updated = await prisma.pendingPayment.updateMany({
    where: { id, status: "pending" },
    data: { status: "rejected", rejectReason: reason },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ error: "Not pending (already handled or processing)" }, { status: 409 });
  }

  // Release the subdomain hold for signup drafts.
  await prisma.onboardingSession.updateMany({
    where: { pendingPayment: { id } },
    data: { status: "failed", failReason: `rejected: ${reason}`.slice(0, 300) },
  });

  return NextResponse.json({ ok: true });
}
