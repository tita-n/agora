import type { PaymentInstructions } from "./types";
import { env } from "@/lib/env";

/**
 * Pure builder for manual bank-transfer instructions (kept out of the
 * provider module so it can be unit-tested without a database client).
 *
 * Account details come ONLY from env vars — never committed, never
 * hardcoded (same rule as every other secret in this repo).
 */

export interface ManualBankConfig {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export function manualBankConfig(): ManualBankConfig | null {
  const {
    MANUAL_BANK_NAME,
    MANUAL_BANK_ACCOUNT_NAME,
    MANUAL_BANK_ACCOUNT_NUMBER,
  } = env as unknown as {
    MANUAL_BANK_NAME?: string;
    MANUAL_BANK_ACCOUNT_NAME?: string;
    MANUAL_BANK_ACCOUNT_NUMBER?: string;
  };
  if (!MANUAL_BANK_NAME || !MANUAL_BANK_ACCOUNT_NAME || !MANUAL_BANK_ACCOUNT_NUMBER) {
    return null;
  }
  return {
    bankName: MANUAL_BANK_NAME,
    accountName: MANUAL_BANK_ACCOUNT_NAME,
    accountNumber: MANUAL_BANK_ACCOUNT_NUMBER,
  };
}

export function bankInstructions(
  bank: ManualBankConfig,
  amountKobo: number,
  reference: string
): PaymentInstructions {
  return {
    type: "bank_transfer",
    amountKobo,
    bankName: bank.bankName,
    accountName: bank.accountName,
    accountNumber: bank.accountNumber,
    reference,
  };
}
