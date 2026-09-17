import { z } from "zod";

/**
 * Environment validation (finding M-5).
 *
 * Required vars fail fast: in production a missing/short NEXTAUTH_SECRET,
 * absent DATABASE_URL, or malformed ROOT_DOMAIN throws at import time
 * (build/boot) instead of degrading into opaque request-time auth failures
 * or silently disabling subdomain tenancy. In development the same
 * violations are loud console warnings, not hard failures, so a partial
 * local setup still runs.
 */

const isProd = process.env.NODE_ENV === "production";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be >= 32 chars (openssl rand -base64 32)"),
  ROOT_DOMAIN: z
    .string()
    .regex(
      /^[a-z0-9.-]+$/,
      "ROOT_DOMAIN must be a bare lowercase host, e.g. agora.com (no protocol, no wildcard)"
    ),
  NEXTAUTH_URL: z.string().url().optional(),
  // Only required when exercising uploads (/api/blob/*); the blob SDK
  // reads it from the environment itself.
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  // ── Payment providers (Phase 1.5) ──────────────────────────────────────
  // The ONE switch for the money path: manual bank transfer (active) or
  // paystack (kept ready). Flipping this env var is the entire migration
  // path — no code change.
  PAYMENT_PROVIDER: z.enum(["manual", "paystack"]).default("manual"),
  // Manual provider destination account — env only, never committed
  // (details change, and hardcoded credentials are exactly what C-1/C-2
  // were about). Required in production while the manual provider is active.
  MANUAL_BANK_NAME: z
    .string()
    .min(2, 'MANUAL_BANK_NAME required, e.g. "Guaranty Trust Bank"')
    .optional(),
  MANUAL_BANK_ACCOUNT_NAME: z
    .string()
    .min(2, "MANUAL_BANK_ACCOUNT_NAME (the account's registered name) required")
    .optional(),
  MANUAL_BANK_ACCOUNT_NUMBER: z
    .string()
    .regex(/^\d{9,17}$/, "MANUAL_BANK_ACCOUNT_NUMBER must be 9–17 digits")
    .optional(),
  // Paystack secret key (sk_test_… for local/test work). Required in
  // production only when PAYMENT_PROVIDER=paystack (see refine).
  PAYSTACK_SECRET_KEY: z
    .string()
    .regex(
      /^sk_(test|live)_[A-Za-z0-9_]+$/,
      "PAYSTACK_SECRET_KEY must look like sk_test_… / sk_live_…"
    )
    .optional(),
  // Test seam only: point at a local mock to unit-test the client. NEVER set
  // this in production.
  PAYSTACK_API_BASE_URL: z.string().url().optional(),

  // Vercel Cron protection — required in production because vercel.json
  // ships enabled cron endpoints; their handlers reject anything that does
  // not present this secret.
  CRON_SECRET: z
    .string()
    .min(16, "CRON_SECRET must be >= 16 chars (openssl rand -hex 16)")
    .optional(),
  // Email for renewal reminders. Optional everywhere BY DESIGN: the cron
  // jobs log clearly when unset — this feature must not block on email.
  RESEND_API_KEY: z.string().min(10).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
})
.superRefine((val, ctx) => {
  if (!isProd) return;
  const add = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  if (val.PAYMENT_PROVIDER === "paystack" && !val.PAYSTACK_SECRET_KEY) {
    add(
      "PAYSTACK_SECRET_KEY",
      "PAYSTACK_SECRET_KEY is required in production when PAYMENT_PROVIDER=paystack"
    );
  }
  if (
    val.PAYMENT_PROVIDER === "manual" &&
    !(val.MANUAL_BANK_NAME && val.MANUAL_BANK_ACCOUNT_NAME && val.MANUAL_BANK_ACCOUNT_NUMBER)
  ) {
    add(
      "MANUAL_BANK_ACCOUNT_NUMBER",
      "PAYMENT_PROVIDER=manual requires MANUAL_BANK_NAME, MANUAL_BANK_ACCOUNT_NAME and MANUAL_BANK_ACCOUNT_NUMBER"
    );
  }
  if (!val.CRON_SECRET) {
    add(
      "CRON_SECRET",
      "CRON_SECRET is required in production (vercel.json ships enabled payment crons)"
    );
  }
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const msg = `Invalid/missing environment: ${parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ")}`;
  if (isProd) {
    throw new Error(msg);
  }
  console.warn(`[env] ${msg}`);
}

/**
 * Validated env. In development, when validation failed this falls back to
 * the raw process.env (with a warning above) so partial setups keep working.
 */
export const env = (
  parsed.success ? parsed.data : process.env
) as z.infer<typeof EnvSchema>;
