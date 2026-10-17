/**
 * Login-failure classification (Part 2): a PURE module so the mapping is
 * unit-testable and the same vocabulary is shared by authorize(), the
 * /login page, and the log lines. No next-auth/prisma imports here.
 *
 * Design rules:
 *  - "Invalid email or password" must be the ONLY thing a wrong credential
 *    ever reveals — no user-existence oracle in either direction.
 *  - Infrastructure failure gets a DISTINCT fixed code that reaches the
 *    client as a fixed message; details go to server logs, never the
 *    response. A DB blip must never masquerade as "wrong password".
 */

/** Error string authorize() returns to next-auth on data-layer failure;
 * v4 surfaces it verbatim as signIn()'s res.error — a fixed token, not a
 * message, so nothing leaks through the error channel itself. */
export const AUTH_INFRA_ERROR_CODE = "AuthInfrastructureFailure";
export const AUTH_TOO_MANY_ERROR_CODE = "TooManyAttempts";


/** The generic message for everything credential-shaped. */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";
/** The distinct, fixed message for data-layer failure. */
export const INFRA_FAILURE_MESSAGE =
  "We're having trouble signing you in right now. Please try again in a minute.";

/**
 * Map a next-auth signIn() response error to the user-facing message.
 * Pure, total: null/undefined (success) → "" (no message).
 */
export function loginErrorMessage(nextAuthError: string | null | undefined): string {
  if (!nextAuthError) return "";
  if (nextAuthError === AUTH_INFRA_ERROR_CODE) return INFRA_FAILURE_MESSAGE;
  if (nextAuthError === AUTH_TOO_MANY_ERROR_CODE)
    return "Too many attempts — wait a little and try again.";
  // CredentialsSignin, AccessDenied, or anything else credential-shaped:
  // deliberately the SAME message for unknown codes — an unlisted error
  // must never become an information channel.
  return INVALID_CREDENTIALS_MESSAGE;
}

/**
 * Classify what authorize() caught: data-layer errors (Prisma request
 * errors, connection failures, timeouts/aborts) are "infrastructure";
 * everything else is a bug on our side — authorize still reports it as
 * infrastructure to the user (fail closed, same generic-safe message) but
 * tags the log differently so the two are distinguishable server-side.
 * Detection is by Duck-type markers, never by message substrings a
 * driver might localize.
 */
export type AuthFailureKind = "infrastructure" | "unexpected";

export function classifyThrown(err: unknown): AuthFailureKind {
  if (err instanceof Error) {
    const name = err.name ?? "";
    if (name.startsWith("PrismaClient")) return "infrastructure";
    if (name === "AbortError" || name === "TimeoutError") return "infrastructure";
    // fetch/undici network failures: TypeError with a cause — treat network
    // as infra only when a cause exists; plain TypeErrors are bugs.
    if (name === "TypeError" && (err as { cause?: unknown }).cause) return "infrastructure";
  }
  return "unexpected";
}

/** The fixed, PII-free log line components per failure (email never
 * included; hash never; the only server-side detail is which stage/kind). */
export function authLogContext(
  stage: "lookup" | "hash-compare",
  kind: AuthFailureKind
): string {
  return `[auth] login ${stage} failed code=${kind === "infrastructure" ? "signin-db" : "signin-bug"}`;
}

/** Normalize identifier input before exact-match lookup: the stored email
 * is already normalized (seed + signup both lowercase), so a login typed
 * " Admin@Agora.test" failing exact-match is a UX bug, not a security
 * property. Lowercase + trim only — no Unicode tricks. */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}
