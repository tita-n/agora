import { prisma } from "@/lib/prisma";
import { subdomainOccupancyIssue, type SessionPayload } from "@/lib/onboarding";
import { generateReference } from "./reference";
import { bankInstructions, manualBankConfig } from "./manual-format";
import { PaymentConfigError, type BusinessDraft, type PaymentProvider } from "./types";

/**
 * Manual bank-transfer provider (ACTIVE for now).
 *
 * initiate() stores the validated draft as an OnboardingSession (the shared
 * draft-hold every provider uses) plus a PendingPayment the admin confirms
 * by hand. Nothing is created in `Business` until that confirmation — an
 * abandoned transfer leaves no subdomain occupied in the live table.
 *
 * Confirmation deliberately does NOT live here: it is an admin action on
 * /admin/payments (see /api/admin/payments/*) which routes through the same
 * createBusinessFromDraft() the Paystack webhook uses — one materialization
 * path, two triggers.
 */
export const manualProvider: PaymentProvider = {
  name: "manual",
  async initiate(business: BusinessDraft, amountKobo: number) {
    const bank = manualBankConfig();
    if (!bank) {
      throw new PaymentConfigError(
        "Manual payments are not configured — set MANUAL_BANK_NAME, MANUAL_BANK_ACCOUNT_NAME and MANUAL_BANK_ACCOUNT_NUMBER."
      );
    }

    // Manual can wait on confirmation, so the stricter occupancy rule
    // applies: no existing business AND no other live draft (Business
    // unique(subdomain) stays the final hard backstop at confirm-time).
    const occupancy = await subdomainOccupancyIssue(business.draft.subdomain);
    if (occupancy) throw new PaymentConfigError(occupancy, 409);

    const reference = await generateReference((ref) =>
      prisma.pendingPayment
        .findUnique({ where: { reference: ref }, select: { id: true } })
        .then((r: { id: string } | null) => Boolean(r))
    );

    const payload: SessionPayload = {
      ...business.draft,
      payerEmail: business.payerEmail,
      themeId: business.themeId,
      amountKobo,
    };

    // Draft first; if the queue row fails to land, undo the draft so the
    // user's retry (and the subdomain) isn't held hostage by half a session.
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
      await prisma.pendingPayment.create({
        data: {
          reference,
          kind: "signup",
          amountKobo,
          userId: business.userId,
          businessDraftId: session.id,
        },
      });
    } catch (err) {
      await prisma.onboardingSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      throw err;
    }

    return { reference, instructions: bankInstructions(bank, amountKobo, reference) };
  },
};
