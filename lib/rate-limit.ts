/**
 * Login/signup/reset rate limiting (Phase 0) behind a swappable interface.
 * The DB implementation uses the LoginAttempt table (single-row, atomic
 * updateMany increments); an Upstash/Redis limiter can replace it without
 * touching call sites.
 *
 * Policy notes (deliberate trade-offs):
 *  - Buckets are keyed by the HASHED normalized email (+ action). A
 *    per-IP-only key is forgeable (X-Forwarded-For) and a per-email+IP key
 *    lets an attacker pick unlimited buckets by rotating IPs, so the EMAIL
 *    bucket is the load-bearing one. Consequence: an attacker who knows an
 *    address can lock the real owner out for LOCKOUT_MS. We accept that for
 *    login (short-ish lockout; the only self-service un-lock is correctly
 *    authenticating elsewhere) — this is the same trade-off mainstream
 *    providers make, and the alternative (enumerating attempts) is worse.
 *  - Signup/reset limit abuse of email sending; failures return generic
 *    responses upstream regardless, so a 429 here never confirms anything
 *    about the account.
 */
import crypto from "crypto";
import { prisma } from "./prisma";

export interface RateLimiter {
  check(key: string, now?: Date): Promise<{ allowed: boolean; retryAfterMs: number }>;
  recordFailure(key: string, now?: Date): Promise<void>;
  recordSuccess(key: string, now?: Date): Promise<void>;
}

export interface LimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number; // 0 = no escalation beyond the window
}

export const LIMITS = {
  login: { maxAttempts: 8, windowMs: 15 * 60_000, lockoutMs: 30 * 60_000 },
  signup: { maxAttempts: 5, windowMs: 60 * 60_000, lockoutMs: 0 },
  reset: { maxAttempts: 5, windowMs: 60 * 60_000, lockoutMs: 0 },
} as const satisfies Record<string, LimitConfig>;

export type LimitAction = keyof typeof LIMITS;

export function bucketKey(action: LimitAction, email: string): string {
  return crypto
    .createHash("sha256")
    .update(`${action}|${email.trim().toLowerCase()}`, "utf8")
    .digest("hex");
}

/** Pure decision core — unit-tested without a database. */
export function decide(
  cfg: LimitConfig,
  row: { count: number; windowStart: Date; lockedUntil: Date | null } | null,
  now: Date
): { allowed: boolean; retryAfterMs: number } {
  if (!row) return { allowed: true, retryAfterMs: 0 };
  if (row.lockedUntil && row.lockedUntil > now) {
    return { allowed: false, retryAfterMs: row.lockedUntil.getTime() - now.getTime() };
  }
  const staleWindow = now.getTime() - row.windowStart.getTime() > cfg.windowMs;
  if (staleWindow) return { allowed: true, retryAfterMs: 0 };
  return { allowed: row.count < cfg.maxAttempts, retryAfterMs: row.windowStart.getTime() + cfg.windowMs - now.getTime() };
}

/** Pure state transition for recordFailure — unit-tested. */
export function nextFailure(
  cfg: LimitConfig,
  row: { count: number; windowStart: Date; lockedUntil: Date | null } | null,
  now: Date
): { count: number; windowStart: Date; lockedUntil: Date | null } {
  const fresh = !row || now.getTime() - row.windowStart.getTime() > cfg.windowMs;
  const count = fresh ? 1 : row!.count + 1;
  const windowStart = fresh ? now : row!.windowStart;
  const shouldLock = count >= cfg.maxAttempts && cfg.lockoutMs > 0;
  return {
    count,
    windowStart,
    lockedUntil: shouldLock ? new Date(now.getTime() + cfg.lockoutMs) : row && !fresh ? row.lockedUntil : null,
  };
}

export class DbRateLimiter implements RateLimiter {
  constructor(private readonly cfg: LimitConfig) {}

  async check(key: string, now = new Date()) {
    const row = await prisma.loginAttempt.findUnique({ where: { key } });
    return decide(this.cfg, row ?? null, now);
  }

  async recordFailure(key: string, now = new Date()) {
    const row = await prisma.loginAttempt.findUnique({ where: { key } });
    const next = nextFailure(this.cfg, row ?? null, now);
    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, ...next },
      update: next,
    });
  }

  async recordSuccess(key: string) {
    await prisma.loginAttempt.deleteMany({ where: { key } });
  }
}

const limiters = {
  login: new DbRateLimiter(LIMITS.login),
  signup: new DbRateLimiter(LIMITS.signup),
  reset: new DbRateLimiter(LIMITS.reset),
} satisfies Record<LimitAction, RateLimiter>;

/** Shared route-level guard: returns null when allowed, or the seconds to
 * wait when not. Callers answer with a generic 429 + Retry-After header. */
export async function guardAction(
  action: LimitAction,
  email: string,
  now = new Date()
): Promise<{ retryAfterSec: number } | null> {
  const key = bucketKey(action, email);
  const res = await limiters[action].check(key, now);
  if (res.allowed) return null;
  return { retryAfterSec: Math.max(1, Math.ceil(res.retryAfterMs / 1000)) };
}

export async function noteFailure(action: LimitAction, email: string): Promise<void> {
  await limiters[action].recordFailure(bucketKey(action, email));
}

export async function noteSuccess(action: LimitAction, email: string): Promise<void> {
  await limiters[action].recordSuccess(bucketKey(action, email));
}
