import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { draftSchema } from "@/lib/onboarding";
import { PaystackError, chargeAmountKobo } from "@/lib/paystack";
import { getActiveProvider } from "@/lib/payments";
import { PaymentConfigError } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/payment-init
 *
 * Validates the full onboarding draft, prices it server-side (theme row +
 * hosting fee — the client never sends money or theme ids), then hands off
 * to the ACTIVE payment provider (PAYMENT_PROVIDER env; "manual" bank
 * transfer today, "paystack" hosted checkout tomorrow — same call, swap by
 * env alone).
 *
 * Response contract for the wizard:
 *   { provider, reference, amountKobo, instructions }
 * where instructions.type === "bank_transfer" (render details + wait for
 * admin) or "checkout_redirect" (navigate to redirectUrl — the Paystack
 * path; its confirmation machinery — webhook + /onboard/callback — is
 * untouched and lives outside this route).
 *
 * No Business row is created here under either provider: manual materializes
 * on admin confirm, paystack on verified charge.success.
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

  const provider = getActiveProvider();
  try {
    const result = await provider.initiate(
      {
        draft,
        userId: user.id,
        payerEmail: user.email,
        themeId: theme.id,
        callbackOrigin: req.nextUrl.origin,
      },
      amountKobo
    );
    return NextResponse.json({
      provider: provider.name,
      reference: result.reference,
      amountKobo,
      instructions: result.instructions,
    });
  } catch (err) {
    if (err instanceof PaymentConfigError || err instanceof PaystackError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[payment-init] unexpected failure:", err);
    return NextResponse.json({ error: "Could not start payment" }, { status: 500 });
  }
}
