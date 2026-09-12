import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { draftSchema, type SessionPayload } from "@/lib/onboarding";
import { HOSTING_FEE_KOBO, chargeAmountKobo, ensureMonthlyPlan, initializeTransaction } from "@/lib/paystack";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/payment-init
 *
 * Validates the full onboarding draft, stores it as an OnboardingSession
 * (NOT a Business — rows materialize only from verified payment), and
 * starts a Paystack subscription-backed transaction (plan interval is
 * monthly, so renewals are handled by Paystack per the Subscriptions API
 * requirement). Returns { reference, authorizationUrl }; the browser
 * navigates to authorizationUrl.
 *
 * The charge amount is computed HERE from the DB theme price — the client
 * never sends money. Email is the signed-in user's, never client input.
 */
export async function POST(req: NextRequest) {
  // Same-origin check for cookie-authenticated mutation (NextAuth only
  // CSRF-protects its own endpoints; route handlers are on us).
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "business_owner") {
    return NextResponse.json({ error: "Onboarding is for business owners" }, { status: 403 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "Account has no email — required for billing" }, { status: 400 });
  }

  // Phase 1 policy: one business per account.
  const existing = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This account already has a business. Edit it from the dashboard." },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 }
    );
  }
  const draft = parsed.data;

  // Re-run the occupancy check server-side at the moment of money (the live
  // picker is advisory; this is the enforcement that prevents double-sale).
  const taken = await prisma.business.findUnique({
    where: { subdomain: draft.subdomain },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json({ error: "That subdomain is already taken." }, { status: 409 });
  }

  // Phase 1 ships exactly one theme: "Minimal". themeId is resolved here,
  // never accepted from the client.
  const theme = await prisma.theme.findFirst({
    where: { name: "Minimal" },
    select: { id: true, price: true },
  });
  if (!theme) {
    return NextResponse.json({ error: "No theme available yet — check back soon." }, { status: 503 });
  }

  let amountKobo: number;
  try {
    amountKobo = chargeAmountKobo(theme.price); // > 0 enforced here + DB CHECK
  } catch {
    return NextResponse.json({ error: "Theme pricing is misconfigured (price must be > 0)." }, { status: 500 });
  }

  const reference = `aos_${randomUUID()}`;
  const payload: SessionPayload = {
    ...draft,
    payerEmail: user.email,
    themeId: theme.id,
    amountKobo,
  };

  const session = await prisma.onboardingSession.create({
    data: { userId: user.id, reference, payload: payload as never, status: "initiated" },
    select: { id: true },
  });

  try {
    const planCode = await ensureMonthlyPlan(amountKobo);
    const tx = await initializeTransaction({
      email: payload.payerEmail,
      amountKobo,
      reference,
      planCode,
      callbackUrl: `${req.nextUrl.origin}/onboard/callback?reference=${encodeURIComponent(reference)}`,
      metadata: { source: "agora-onboarding", sessionId: session.id, hostingFeeKobo: HOSTING_FEE_KOBO },
    });
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { paystackTxId: tx.txId },
    });
    return NextResponse.json({
      reference,
      authorizationUrl: tx.authorizationUrl,
      amountKobo,
    });
  } catch (err) {
    // Payment could not even start — release the draft's claim on the
    // subdomain immediately instead of locking it for the session window.
    await prisma.onboardingSession
      .update({ where: { id: session.id }, data: { status: "failed", failReason: "paystack initialize failed" } })
      .catch(() => undefined);
    const message = err instanceof Error ? err.message : "Could not start payment";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
