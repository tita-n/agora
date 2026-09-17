import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ensureMonthlyPlan,
  initializeTransaction,
  HOSTING_FEE_KOBO,
} from "@/lib/paystack";
import type { SessionPayload } from "@/lib/onboarding";
import type { BusinessDraft, PaymentProvider } from "./types";

/**
 * Paystack provider — Phase 1's flow, wrapped to conform to PaymentProvider.
 * The underlying machinery (lib/paystack.ts client, /api/webhooks/paystack,
 * /api/onboarding/confirm + fulfillPaidSession) is UNCHANGED: this module
 * only owns "create the OnboardingSession, ensure the monthly plan, start a
 * hosted checkout". Confirmation stays webhook/return-flow driven — the
 * per-provider confirm difference the interface deliberately doesn't flatten.
 */
export const paystackProvider: PaymentProvider = {
  name: "paystack",
  async initiate(business: BusinessDraft, amountKobo: number) {
    const reference = `aos_${randomUUID()}`;
    const payload: SessionPayload = {
      ...business.draft,
      payerEmail: business.payerEmail,
      themeId: business.themeId,
      amountKobo,
    };

    const session = await prisma.onboardingSession.create({
      data: {
        userId: business.userId,
        reference,
        payload: payload as never,
        status: "initiated",
      },
      select: { id: true },
    });

    try {
      const planCode = await ensureMonthlyPlan(amountKobo);
      const tx = await initializeTransaction({
        email: payload.payerEmail,
        amountKobo,
        reference,
        planCode,
        callbackUrl: `${business.callbackOrigin}/onboard/callback?reference=${encodeURIComponent(reference)}`,
        metadata: {
          source: "agora-onboarding",
          sessionId: session.id,
          hostingFeeKobo: HOSTING_FEE_KOBO,
        },
      });
      await prisma.onboardingSession.update({
        where: { id: session.id },
        data: { paystackTxId: tx.txId },
      });
      return {
        reference,
        instructions: {
          type: "checkout_redirect" as const,
          amountKobo,
          reference,
          redirectUrl: tx.authorizationUrl,
        },
      };
    } catch (err) {
      // Payment could not even start — release the draft's claim on the
      // subdomain immediately instead of locking it for the session window.
      await prisma.onboardingSession
        .update({
          where: { id: session.id },
          data: { status: "failed", failReason: "paystack initialize failed" },
        })
        .catch(() => undefined);
      throw err;
    }
  },
};
