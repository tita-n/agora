/**
 * Onboarding validation, DB-free so every layer (live picker, API routes,
 * webhook fulfillment, unit tests) can share the exact same rules without
 * pulling in a database client. lib/onboarding.ts re-exports these.
 */
import { SUBDOMAIN_RE, RESERVED_SUBDOMAINS } from "./tenant";
import { z } from "zod";

/**
 * Pure structural subdomain check (no DB): DNS-label regex + reserved list,
 * both sourced from lib/tenant.ts — the single validator (ground rule).
 * Returns a human-readable reason, or null when the label is well-formed.
 */
export function subdomainShapeIssue(sub: string): string | null {
  if (!SUBDOMAIN_RE.test(sub)) {
    return "Use lowercase letters, numbers, and hyphens (1–63 chars, starting and ending with a letter or number).";
  }
  if (RESERVED_SUBDOMAINS.has(sub)) {
    return "That name is reserved.";
  }
  return null;
}

export const draftSchema = z
  .object({
    subdomain: z
      .string()
      .trim()
      .transform((v) => v.toLowerCase())
      .refine((v) => SUBDOMAIN_RE.test(v), { message: "Invalid subdomain" })
      .refine((v) => !RESERVED_SUBDOMAINS.has(v), { message: "Reserved subdomain" }),
    name: z
      .string()
      .trim()
      .min(1, "Business name is required")
      .max(80, "Name is too long"),
    description: z
      .string()
      .trim()
      .max(500, "Description is too long")
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    contactEmail: z
      .union([z.string().trim().email("Enter a valid email"), z.literal("")])
      .transform((v) => (v === "" ? undefined : v.toLowerCase()))
      .optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^[0-9+()\-\s.]{6,20}$/, "Enter a valid phone number")
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    address: z
      .string()
      .trim()
      .max(200, "Address is too long")
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    // Strict #rrggbb — this value is injected into an inline style attribute.
    primaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #1a7f5a")
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    // Only blobs we minted via the upload flow — never an arbitrary URL.
    logoUrl: z
      .string()
      .trim()
      .regex(
        /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/\S+$/i,
        "Logo must be an uploaded blob URL"
      )
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
  })
  .strict(); // reject unknown keys (client cannot smuggle themeId, price, status, …)

export type OnboardingDraft = z.infer<typeof draftSchema>;

/**
 * Draft + server-derived fields persisted in OnboardingSession.payload.
 * amountKobo is computed server-side (theme lookup) at payment-init;
 * fulfillment reconciles the actual charge against it.
 */
export interface SessionPayload extends OnboardingDraft {
  payerEmail: string; // from the signed-in User row, never client input
  themeId: string;
  amountKobo: number;
}

/**
 * Validate a stored OnboardingSession.payload: the draft half goes through
 * draftSchema (strict — so the three SERVER-owned keys must be split off
 * first, not fed to it), the server half gets its own type/format checks.
 * A payload that fails here can never become a Business row.
 */
export function parseSessionPayload(raw: unknown): SessionPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  try {
    const { payerEmail, themeId, amountKobo, ...draft } = raw as Record<string, unknown>;
    if (
      typeof payerEmail !== "string" ||
      !z.string().email().safeParse(payerEmail).success ||
      typeof themeId !== "string" ||
      themeId === "" ||
      !Number.isSafeInteger(amountKobo) ||
      (amountKobo as number) <= 0
    ) {
      return null;
    }
    const parsed = draftSchema.parse(draft);
    return {
      ...parsed,
      payerEmail,
      themeId,
      amountKobo: amountKobo as number,
    };
  } catch {
    return null;
  }
}
