/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` to cron endpoints
 * automatically when CRON_SECRET is set on the project. This is the single
 * guard for the payment cron routes (which have no user session).
 *
 * Semantics:
 *  - secret configured  -> request must present the exact bearer token
 *  - secret NOT configured -> allowed ONLY outside production (local curl
 *    testing); in production env validation already hard-requires CRON_SECRET,
 *    so this branch can never be reached with prod traffic.
 * Pure function (injected values) so it is unit-testable.
 */
export function isCronAuthorized(
  authHeader: string | null,
  secret: string | undefined,
  isProd: boolean
): boolean {
  if (!secret) return !isProd;
  return authHeader === `Bearer ${secret}`;
}
