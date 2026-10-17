import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, getCustomer } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";
import { fulfillPaidSession, SUBSCRIPTION_PERIOD_MS } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook receiver (POST /api/webhooks/paystack).
 *
 * Security rules (ground rules from Phase 0):
 *  - No session-based auth here — this is a machine endpoint. Authenticity
 *    comes ONLY from the HMAC-SHA512 x-paystack-signature header over the
 *    exact raw body, verified before anything is parsed or touched.
 *  - Unverified => 401, no exceptions, no "just log it".
 *  - charge.success does not directly create a Business; it delegates to
 *    fulfillPaidSession(), which independently re-verifies the transaction
 *    against the Paystack API and reconciles amounts (webhook = "there may
 *    be money", API verification + reconciliation = "there is money").
 *
 * Paystack retries non-2xx responses, so transient DB errors must NOT be
 * swallowed into a 200. Permanent/ignore cases return 200 deliberately.
 */

interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Best-effort reads from loosely-typed Paystack payloads. */
const asObj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
const asStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asNum = (v: unknown): number | null => (typeof v === "number" ? v : null);

export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // EXACT bytes — required for HMAC
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Covers: unsigned, wrong signature, and no PAYSTACK_SECRET_KEY set.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: PaystackEvent;
  try {
    payload = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof payload.event !== "string") {
    return NextResponse.json({ error: "missing event" }, { status: 400 });
  }

  const data = asObj(payload.data);

  try {
    switch (payload.event) {
      case "charge.success":
        await onChargeSuccess(data);
        break;
      case "invoice.payment_failed":
        await setPastDueFromInvoiceFailure(data);
        break;
      case "subscription.disable":
        await setPastDueFromSubscriptionDisable(data);
        break;
      case "subscription.renew":
        await setActiveFromRenewal(data);
        break;
      default:
        // Not every Paystack event is ours to care about yet.
        console.log(`[paystack-webhook] ignoring event: ${payload.event}`);
    }
  } catch (err) {
    // Let Paystack retry real processing failures (DB down, API down).
    console.error(
      `[paystack-webhook] handler failed for ${payload.event}:`,
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Onboarding payment. Only references we issued (aos_*) map to a session;
 * anything else (e.g. a renewal charge, someone else's transaction) is
 * acknowledged and ignored.
 */
async function onChargeSuccess(data: Record<string, unknown>) {
  const reference = asStr(data.reference);
  if (!reference || !reference.startsWith("aos_")) return; // not our onboarding flow

  const session = await prisma.onboardingSession.findUnique({
    where: { reference },
    select: { id: true, status: true },
  });
  if (!session) return; // unknown reference: acknowledge, do nothing

  const result = await fulfillPaidSession(reference);
  if (!result.ok) {
    // Verification/reconciliation issue — record for support; keep 200 so
    // Paystack doesn't hammer. A human (or the returning user) can retry.
    console.warn(`[paystack-webhook] charge.success not fulfilled (${reference}): ${result.reason}`);
  }
}

/** Resolve a business id from the subscription code on the event, falling
 * back to the customer code. Returns null for unrelated customers. */
async function businessIdFromEvent(data: Record<string, unknown>): Promise<string | null> {
  const subscriptionCode = asStr(data.subscription_code);
  if (subscriptionCode) {
    const bySub = await prisma.business.findFirst({
      where: { paystackSubscriptionCode: subscriptionCode },
      select: { id: true },
    });
    if (bySub) return bySub.id;
  }

  let customerCode = asStr(asObj(data.customer).customer_code);
  const customerId = asNum(data.customer) ?? asNum(asObj(data.customer).id);
  if (!customerCode && customerId !== null) {
    // Payload carried only a customer id — resolve it via the API.
    const cust = await getCustomer(customerId).catch(() => null);
    customerCode = cust?.customerCode ?? null;
    if (!customerCode && cust?.email) {
      const owner = await prisma.user.findUnique({
        where: { email: cust.email.toLowerCase() },
        select: { id: true },
      });
      if (owner) {
        const biz = await prisma.business.findFirst({
          where: { ownerId: owner.id },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
        if (biz) return biz.id;
      }
    }
  }
  if (!customerCode) return null;

  const byCust = await prisma.business.findFirst({
    where: { paystackCustomerCode: customerCode },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return byCust?.id ?? null;
}

/** Failed recurring invoice: flip to past_due (grace — never delete/disable). */
async function setPastDueFromInvoiceFailure(data: Record<string, unknown>) {
  const businessId = await businessIdFromEvent(data);
  if (!businessId) return;
  await prisma.business.update({
    where: { id: businessId },
    data: { subscriptionStatus: "past_due" },
  });
}

/** Subscription switched off: same treatment as a failed invoice. */
async function setPastDueFromSubscriptionDisable(data: Record<string, unknown>) {
  const code = asStr(asObj(data.subscription).code);
  if (code) {
    const hit = await prisma.business.findFirst({
      where: { paystackSubscriptionCode: code },
      select: { id: true },
    });
    if (hit) {
      await prisma.business.update({
        where: { id: hit.id },
        data: { subscriptionStatus: "past_due" },
      });
      return;
    }
  }
  await setPastDueFromInvoiceFailure(data);
}

/** A successful renewal: back to active, bump nextBillingDate, and capture
 * the subscription code if we somehow don't have it yet. */
async function setActiveFromRenewal(data: Record<string, unknown>) {
  const businessId = await businessIdFromEvent(data);
  if (!businessId) return;
  await prisma.business.update({
    where: { id: businessId },
    data: {
      subscriptionStatus: "active",
      nextBillingDate: new Date(Date.now() + SUBSCRIPTION_PERIOD_MS),
      paystackSubscriptionCode:
        asStr(asObj(data.subscription).code) ?? asStr(data.subscription_code) ?? undefined,
    },
  });
}


