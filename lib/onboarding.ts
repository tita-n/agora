/**
 * Onboarding fulfillment (Phase 1) — the DB-touching half. The validation
 * half lives in lib/onboarding-schema.ts (imported + re-exported here so
 * callers keep a single entry point, and the schema module stays testable
 * without a generated Prisma client).
 *
 * draftSchema is the ONE validator for onboarding input — the subdomain
 * picker, the payment-init route, and webhook fulfillment all run through
 * it, and subdomain rules delegate to lib/tenant.ts (ground rule: no second,
 * looser validator). The stored OnboardingSession.payload is re-parsed with
 * this schema at fulfillment time, so a tampered/drifted draft can never
 * reach the Business row.
 */
import { prisma } from "./prisma";
import { isPrismaUniqueError } from "./db-error";
import { getVerifiedSuccessfulTransaction, PaystackError, CURRENCY } from "./paystack";
import {
  draftSchema,
  parseSessionPayload,
  subdomainShapeIssue,
  type OnboardingDraft,
  type SessionPayload,
} from "./onboarding-schema";

export {
  draftSchema,
  parseSessionPayload,
  subdomainShapeIssue,
  type OnboardingDraft,
  type SessionPayload,
};

export const SUBDOMAIN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // lock window for live sessions
export const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // "one month out"

/**
 * Subdomain occupancy: an existing business, or a live onboarding session
 * (paid-but-unfulfilled or recently initiated) holding the same name.
 */
export async function subdomainOccupancyIssue(sub: string): Promise<string | null> {
  const business = await prisma.business.findUnique({
    where: { subdomain: sub },
    select: { id: true },
  });
  if (business) return "That subdomain is already taken.";

  const live = await prisma.onboardingSession.findMany({
    where: {
      status: { in: ["initiated", "paid"] },
      createdAt: { gt: new Date(Date.now() - SUBDOMAIN_MAX_AGE_MS) },
    },
    select: { payload: true },
  });
  const clash = live.some(
    (s: { payload: unknown }) =>
      (s.payload as { subdomain?: string }).subdomain === sub
  );
  return clash
    ? "That subdomain is being claimed by another onboarding right now. Try again shortly."
    : null;
}

export type FulfillResult =
  | { ok: true; businessId: string; alreadyDone?: boolean }
  | { ok: false; reason: string };

/**
 * The ONE materialization path from a validated draft to a live Business —
 * used by Paystack fulfillment below AND by /api/admin/payments/confirm for
 * manual transfers. Same fields, same "active + one month out" semantics,
 * whichever trigger (gateway verification or admin button) got us here.
 */
export async function createBusinessFromDraft(input: {
  userId: string;
  payload: SessionPayload;
  paystackCustomerCode?: string | null;
}) {
  const { payload } = input;
  return prisma.business.create({
    data: {
      name: payload.name,
      subdomain: payload.subdomain,
      description: payload.description ?? null,
      contactEmail: payload.contactEmail ?? null,
      contactPhone: payload.contactPhone ?? null,
      address: payload.address ?? null,
      primaryColor: payload.primaryColor ?? null,
      logoUrl: payload.logoUrl ?? null,
      ownerId: input.userId,
      themeId: payload.themeId,
      subscriptionStatus: "active",
      nextBillingDate: new Date(Date.now() + SUBSCRIPTION_PERIOD_MS),
      paystackCustomerCode: input.paystackCustomerCode ?? null,
    },
  });
}

/**
 * Materialize a paid session into a live Business. Safe to call from the
 * webhook AND the return-from-Paystack confirm route:
 *  - single-flight: only the caller that flips initiated→paid proceeds
 *  - verifies the charge against Paystack's API (never trusts webhook body alone)
 *  - reconciles the amount actually paid against the amount we invoiced
 *  - idempotent: repeat calls resolve to the already-created business
 */
export async function fulfillPaidSession(reference: string): Promise<FulfillResult> {
  const session = await prisma.onboardingSession.findUnique({
    where: { reference },
    select: {
      id: true,
      userId: true,
      status: true,
      paystackTxId: true,
      payload: true,
      businessId: true,
    },
  });
  if (!session) return { ok: false, reason: "Unknown payment reference." };
  if (session.status === "business_created" && session.businessId) {
    return { ok: true, businessId: session.businessId, alreadyDone: true };
  }
  if (session.status === "failed") {
    return { ok: false, reason: session.failReason ?? "This onboarding was closed." };
  }

  const markFailed = async (reason: string): Promise<FulfillResult> => {
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: "failed", failReason: reason.slice(0, 300) },
    });
    return { ok: false, reason };
  };

  // Only the winner of the initiated→paid flip runs fulfillment. If the
  // session is already 'paid', it was claimed elsewhere: caller should re-poll.
  if (session.status === "initiated") {
    const claimed = await prisma.onboardingSession.updateMany({
      where: { id: session.id, status: "initiated" },
      data: { status: "paid" },
    });
    if (claimed.count !== 1) {
      return { ok: false, reason: "Payment is still being confirmed; try again in a moment." };
    }
  }

  if (!session.paystackTxId) {
    return markFailed("Session has no Paystack transaction id to verify against.");
  }

  let tx: Awaited<ReturnType<typeof getVerifiedSuccessfulTransaction>>;
  try {
    tx = await getVerifiedSuccessfulTransaction(session.paystackTxId);
  } catch (err) {
    if (err instanceof PaystackError && err.status === 409) {
      // Not yet success at Paystack: leave the session 'paid' so the
      // webhook / a later confirm retry finishes it. Not a hard failure.
      return { ok: false, reason: "Paystack has not confirmed this charge yet." };
    }
    throw err;
  }
  if (tx.reference !== reference) {
    return markFailed("Paystack transaction reference mismatch.");
  }

  const payload = parseSessionPayload(session.payload);
  if (!payload) {
    return markFailed("Stored draft failed validation — refusing to create a business.");
  }

  // Money reconciliation: the charge must match what we invoiced, exactly.
  if (tx.amount !== payload.amountKobo || tx.currency.toUpperCase() !== CURRENCY) {
    return markFailed(
      `Charged amount ${tx.amount} ${tx.currency} does not match invoiced ${payload.amountKobo} ${CURRENCY}. Manual review required.`
    );
  }

  // Final subdomain re-check — a business may have appeared mid-flight.
  const clash = await prisma.business.findUnique({
    where: { subdomain: payload.subdomain },
    select: { id: true },
  });
  if (clash) {
    return markFailed(
      `Subdomain "${payload.subdomain}" was claimed during checkout. Contact support for a refund.`
    );
  }

  try {
    const business = await createBusinessFromDraft({
      userId: session.userId,
      payload,
      paystackCustomerCode: tx.customerCode,
    });
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: "business_created", businessId: business.id },
    });
    return { ok: true, businessId: business.id };
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      // Prisma unique constraint — subdomain race or duplicate businessId.
      return markFailed("Subdomain was taken in the final moment. Contact support for a refund.");
    }
    throw err;
  }
}
