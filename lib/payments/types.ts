import type { OnboardingDraft } from "@/lib/onboarding-schema";

/**
 * Payment provider abstraction (Phase 1.5). One interface, interchangeable
 * implementations selected by PAYMENT_PROVIDER env — switching manual →
 * paystack later is an env change, nothing else.
 *
 * confirm() is deliberately NOT on this interface: it happens through
 * completely different mechanisms per provider (manual = admin action on
 * /admin/payments, Paystack = signature-verified webhook + API
 * re-verification). Both converge on the same materialization helper
 * (createBusinessFromDraft in lib/onboarding.ts), which is where sharing
 * actually belongs.
 */

/** Everything a provider needs to start collecting money for a draft. */
export interface BusinessDraft {
  /** validated onboarding input (already through draftSchema) */
  draft: OnboardingDraft;
  /** the signed-in owner; businesses are never attributed from client input */
  userId: string;
  /** from the User row — receipt email, Paystack customer identity */
  payerEmail: string;
  /** server-resolved theme id (never client-smuggled) */
  themeId: string;
  /** origin used to build return URLs (e.g. Paystack callback) */
  callbackOrigin: string;
}

export interface PaymentInstructions {
  type: "bank_transfer" | "checkout_redirect";
  amountKobo: number;
  /** bank_transfer — rendered by the wizard, sourced from env only */
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  /** the reference the payer must include with the transfer */
  reference?: string;
  /** checkout_redirect — hosted page (Paystack path, unused while manual is active) */
  redirectUrl?: string;
}

export interface PaymentProvider {
  readonly name: "manual" | "paystack";
  /**
   * Persist whatever the provider needs to hold the draft + payment state,
   * return the reference and what the payer should do next.
   */
  initiate(
    business: BusinessDraft,
    amountKobo: number
  ): Promise<{ reference: string; instructions: PaymentInstructions }>;
}

export class PaymentConfigError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "PaymentConfigError";
    this.status = status;
  }
}
