/**
 * Minimal server-only Paystack client (Phase 1).
 *
 * - The secret key comes from PAYSTACK_SECRET_KEY only — never hardcoded,
 *   never sent to the browser. Payments run in test mode when the key is a
 *   sk_test_… key; nothing else in this module differs between modes.
 * - Amounts are kobo integers end to end. chargeAmountKobo() is the ONLY
 *   place the theme price enters a payment calculation, and it is the
 *   app-side guard for "price > 0" (the DB CHECK constraint is the other).
 * - Base URL is fixed to Paystack unless PAYSTACK_API_BASE_URL is set,
 *   which exists purely so tests can point at a local mock.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

export const HOSTING_FEE_KOBO = 500_000; // ₦5,000 flat hosting fee
export const CURRENCY = "NGN";
const PLAN_NAME = "Agora Minimal Monthly";
const REQUEST_TIMEOUT_MS = 15_000;

export class PaystackError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
  }
}

function secretKey(): string {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new PaystackError(
      "PAYSTACK_SECRET_KEY is not configured",
      503
    );
  }
  return env.PAYSTACK_SECRET_KEY;
}

function baseUrl(): string {
  return (
    env.PAYSTACK_API_BASE_URL?.replace(/\/+$/, "") ?? "https://api.paystack.co"
  );
}

async function paystackFetch(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new PaystackError(`Paystack returned a non-JSON response (${res.status})`);
  }
  if (!res.ok || json.status !== true) {
    // Paystack error messages are safe to surface (they're user-facing hints
    // like "Invalid email"); statuses are what our code branches on.
    throw new PaystackError(
      typeof json.message === "string"
        ? json.message
        : `Paystack request failed (${res.status})`
    );
  }
  return json;
}

/** Theme price enters money only through this. Kobo integers, never floats. */
export function chargeAmountKobo(themePriceKobo: number): number {
  if (!Number.isSafeInteger(themePriceKobo) || themePriceKobo <= 0) {
    throw new PaystackError(
      `Refusing to charge: theme price must be a positive integer of kobo (got ${themePriceKobo})`,
      500
    );
  }
  return themePriceKobo + HOSTING_FEE_KOBO;
}

/**
 * Get-or-create the monthly plan for this exact amount. Paystack renews
 * subscriptions against the plan, so the monthly recurring behavior comes
 * from the plan + subscription flow, not from our code.
 */
export async function ensureMonthlyPlan(amountKobo: number): Promise<string> {
  const list = await paystackFetch(`/plan?perPage=100`);
  const rows = extractRows(list.data);
  const existing = rows.find(
    (p) => p.name === PLAN_NAME && Number(p.amount) === amountKobo
  );
  if (existing && typeof existing.plan_code === "string") {
    return existing.plan_code;
  }
  const created = await paystackFetch(`/plan`, {
    method: "POST",
    body: { name: PLAN_NAME, amount: amountKobo, interval: "monthly" },
  });
  const code = (created.data as { plan_code?: string })?.plan_code;
  if (!code) throw new PaystackError("Paystack did not return a plan_code");
  return code;
}

export function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  planCode: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}): Promise<{ authorizationUrl: string; accessCode: string | null; txId: string }> {
  return paystackFetch(`/transaction/initialize`, {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amountKobo,
      currency: CURRENCY,
      reference: input.reference,
      plan: input.planCode,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  }).then((json) => {
    const d = json.data as {
      authorization_url?: string;
      access_code?: string | null;
      id?: number | string;
    };
    if (!d?.authorization_url) {
      throw new PaystackError("Paystack initialize returned no authorization_url");
    }
    return {
      authorizationUrl: d.authorization_url,
      accessCode: d.access_code ?? null,
      txId: String(d.id ?? ""),
    };
  });
}

/**
 * Server-side re-verification of a charge. Called BEFORE anything is
 * fulfilled, by both the webhook handler and the manual confirm route —
 * a webhook tells us Paystack said success; this proves it via the API.
 */
export async function getVerifiedSuccessfulTransaction(txId: string): Promise<{
  id: string;
  reference: string;
  amount: number;
  currency: string;
  customerCode: string | null;
  email: string | null;
}> {
  const json = await paystackFetch(`/transaction/${encodeURIComponent(txId)}`);
  const d = json.data as {
    id?: number;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    customer?: { customer_code?: string; email?: string };
  };
  if (!d || d.status !== "success") {
    throw new PaystackError("Transaction is not (yet) marked successful at Paystack", 409);
  }
  return {
    id: String(d.id ?? ""),
    reference: d.reference ?? "",
    amount: Number(d.amount ?? 0),
    currency: d.currency ?? CURRENCY,
    customerCode: d.customer?.customer_code ?? null,
    email: d.customer?.email ?? null,
  };
}

function extractRows(data: unknown): Array<Record<string, unknown>> {
  // Paystack list endpoints return either data:[…] or data:{data:[…]}
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: Array<Record<string, unknown>> }).data;
  }
  return [];
}

/**
 * Paystack's "update payment source" page for a subscription
 * (POST /subscription/:code/edit). Used by the dashboard's calm past_due
 * prompt so a failed renewal is fixable without anyone emailing support.
 */
export async function getSubscriptionUpdateUrl(subscriptionCode: string): Promise<string> {
  const json = await paystackFetch(`/subscription/${encodeURIComponent(subscriptionCode)}/edit`, {
    method: "POST",
  });
  const url = (json.data as { authorization_url?: string })?.authorization_url;
  if (!url) throw new PaystackError("Paystack did not return a payment-update URL");
  return url;
}

/**
 * Some webhook payloads embed a bare customer ID instead of the object.
 * Resolve it (customer_code + email) so recurring events can be matched to
 * a Business regardless of payload shape.
 */
export async function getCustomer(customerId: number | string): Promise<{
  customerCode: string | null;
  email: string | null;
}> {
  const json = await paystackFetch(`/customer/${encodeURIComponent(String(customerId))}`);
  const d = json.data as { customer_code?: string; email?: string };
  return { customerCode: d?.customer_code ?? null, email: d?.email ?? null };
}

/**
 * Webhook signature verification (hard requirement): Paystack signs the
 * EXACT raw request body with HMAC-SHA512 keyed by the secret key.
 * Compare constant-time; reject anything unsigned, malformed, or mismatched.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key) return false; // no key configured => we can (and will) trust nothing
  const expected = createHmac("sha512", key).update(rawBody, "utf8").digest("hex");
  const got = Buffer.from(signature.toLowerCase(), "utf8");
  const want = Buffer.from(expected, "utf8");
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
