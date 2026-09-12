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
