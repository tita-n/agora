import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBusinessFromDraft, parseSessionPayload, subdomainOccupancyIssue } from "@/lib/onboarding";
import { isPrismaUniqueError } from "@/lib/db-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payments/confirm  { id }
 *
 * The single human-in-the-loop gate for the manual provider: creates the
 * Business from the held draft, marks it active with a one-month billing
 * date, and flips the PendingPayment to confirmed. Before this click nothing
 * occupies a subdomain in Business; after it the site is live.
 *
 * SECURITY: server-side role gate (must be `admin`), same-origin check, and
 * the draft is re-parsed through the strict schema at creation time — a
 * tampered/stale payload can never become a Business row. Renewal payments
 * (kind="renewal") flip the existing business active + bump nextBillingDate
 * instead of creating one.
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

  const payment = await prisma.pendingPayment.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      kind: true,
      status: true,
      amountKobo: true,
      businessDraftId: true,
      businessId: true,
    },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: `Payment already ${payment.status}` }, { status: 409 });
  }

  // Single-flight: claim it so a double-click can't create two businesses.
  // Claim strictly from pending — a stuck "processing" row (crash mid-confirm)
  // is an operator investigation case by design, never silently re-claimable
  // while it might race with the original attempt.
  const claimed = await prisma.pendingPayment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ error: "Payment was already handled" }, { status: 409 });
  }

  try {
    if (payment.kind === "renewal") {
      if (!payment.businessId) throw new Error("Renewal payment has no business");
      await prisma.business.update({
        where: { id: payment.businessId },
        data: {
          subscriptionStatus: "active",
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.pendingPayment.update({
        where: { id: payment.id },
        data: { status: "confirmed", confirmedById: user.id },
      });
      return NextResponse.json({ ok: true, kind: "renewal" });
    }

    // signup: materialize the Business from the held draft.
    const session = await prisma.onboardingSession.findUnique({
      where: { id: payment.businessDraftId ?? "" },
      select: { id: true, userId: true, payload: true },
    });
    if (!session) throw new Error("Draft session is missing for this payment");

    const payload = parseSessionPayload(session.payload);
    if (!payload) throw new Error("Draft failed validation — refusing to create a business");

    // Final occupancy guard right before the unique insert (Business.subdomain
    // is the hard backstop; this only improves the error message).
    const clash = await subdomainOccupancyIssue(payload.subdomain).catch(() => null);
    if (clash && /already taken/i.test(clash)) {
      throw new Error(`Subdomain "${payload.subdomain}" is now taken`);
    }

    const business = await createBusinessFromDraft({
      userId: session.userId,
      payload,
      paystackCustomerCode: null, // manual — no Paystack customer
    });

    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: "business_created", businessId: business.id },
    });
    await prisma.pendingPayment.update({
      where: { id: payment.id },
      data: { status: "confirmed", businessId: business.id, confirmedById: user.id },
    });

    return NextResponse.json({ ok: true, kind: "signup", subdomain: business.subdomain });
  } catch (err) {
    // Roll the claim back so the admin can retry after fixing the cause.
    await prisma.pendingPayment
      .update({ where: { id: payment.id }, data: { status: "pending" } })
      .catch(() => undefined);
    const message = err instanceof Error ? err.message : "Confirmation failed";
    const alreadyTaken = isPrismaUniqueError(err) || /taken/i.test(message);
    return NextResponse.json(
      { error: alreadyTaken ? "That subdomain was just taken — reject this payment" : message },
      { status: alreadyTaken ? 409 : 400 }
    );
    // (rollback above restored "pending"; stuck-processing recovery, if ever
    // needed, is a deliberate manual step — see claim comment)
  }
}
