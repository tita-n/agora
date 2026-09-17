import { env } from "@/lib/env";
import { manualProvider } from "./manual";
import { paystackProvider } from "./paystack";
import type { PaymentProvider } from "./types";

export type { BusinessDraft, PaymentInstructions, PaymentProvider } from "./types";

/**
 * The whole multi-provider story in one function: PAYMENT_PROVIDER decides.
 * Adding Flutterwave/Moniepoint later means one more module + one case here
 * (+ its webhook/confirm route) — callers never change.
 */
export function getActiveProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "paystack":
      return paystackProvider;
    default:
      // "manual", or unset (dev fallback when env parsing failed): manual is
      // the safe default — it never hits an external API with half a config.
      return manualProvider;
  }
}
