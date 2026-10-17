/**
 * Phase 0 auth unit tests (pure parts — no DB): rate-limit decision/
 * transition math, token hashing/shape, post-login routing priority.
 * The DB-backed halves (consume/redeem, upsert buckets) are covered by the
 * integration suite when a database is reachable.
 */
let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else { fail++; console.error("FAIL", label); }
}
function eq(a: unknown, b: unknown, label: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} — got ${JSON.stringify(a)}`);
}

import { decide, nextFailure, LIMITS, bucketKey } from "../lib/rate-limit";
import { hashToken, randomToken, VERIFY_TOKEN_TTL_MS, RESET_TOKEN_TTL_MS } from "../lib/auth-tokens";
import { postLoginPath } from "../lib/routing";

const now = new Date("2026-10-18T12:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);

// ── rate limiter ──────────────────────────────────────────────────────────
eq(decide(LIMITS.login, null, now), { allowed: true, retryAfterMs: 0 }, "no row → allowed");
eq(decide(LIMITS.login, { count: 7, windowStart: now, lockedUntil: null }, now), { allowed: true, retryAfterMs: LIMITS.login.windowMs }, "7/8 → allowed (window left)");
eq(decide(LIMITS.login, { count: 8, windowStart: now, lockedUntil: null }, now), { allowed: false, retryAfterMs: LIMITS.login.windowMs }, "8/8 → blocked till window end");
eq(decide(LIMITS.login, { count: 8, windowStart: min(-20), lockedUntil: null }, now), { allowed: true, retryAfterMs: 0 }, "stale window resets");
const locked = decide(LIMITS.login, { count: 8, windowStart: min(-20), lockedUntil: min(10) }, now);
eq(locked.allowed, false, "lockout survives window expiry");
ok(locked.retryAfterMs > 9 * 60_000 && locked.retryAfterMs <= 10 * 60_000, "retryAfter counts down to lockout end");

const afterNth = nextFailure(LIMITS.login, { count: 7, windowStart: now, lockedUntil: null }, now);
eq(afterNth.count, 8, "count increments in-window");
ok(afterNth.lockedUntil !== null && afterNth.lockedUntil.getTime() - now.getTime() === LIMITS.login.lockoutMs, "8th failure engages 30m lockout");
const fresh = nextFailure(LIMITS.login, { count: 8, windowStart: min(-30), lockedUntil: min(5) }, now);
eq(fresh.count, 1, "stale window restarts at 1");
eq(nextFailure(LIMITS.signup, null, now).lockedUntil, null, "signup (lockoutMs=0) never escalates beyond window");
ok(bucketKey("login", " A@B.com ") !== bucketKey("reset", "a@b.com") && bucketKey("login", "A@B.COM") === bucketKey("login", "a@b.com"), "bucket key: case/space normalized, per-action");
ok(VERIFY_TOKEN_TTL_MS === 86_400_000 && RESET_TOKEN_TTL_MS === 1_800_000, "token TTLs 24h / 30m");

// ── tokens ────────────────────────────────────────────────────────────────
const t1 = randomToken();
const t2 = randomToken();
ok(t1 !== t2 && /^[A-Za-z0-9_-]{32}$/.test(t1), "random token: url-safe, 32 chars, unique");
ok(hashToken(t1) !== t1 && hashToken(t1).length === 64 && hashToken(t1) === hashToken(t1), "hashed: 64-hex deterministic, never the plaintext");
ok(!hashToken(t1).includes(t1.slice(0, 8)), "hash does not contain the token prefix");

// ── post-login routing ───────────────────────────────────────────────────
eq(postLoginPath({ isStaff: true, hasBusiness: true, isDeveloper: true }), "/admin", "staff wins over everything");
eq(postLoginPath({ isStaff: false, hasBusiness: true, isDeveloper: true }), "/dashboard", "owner first, then developer");
eq(postLoginPath({ isStaff: false, hasBusiness: false, isDeveloper: true }), "/developer", "developer console when no business");
eq(postLoginPath({ isStaff: false, hasBusiness: false, isDeveloper: false }), "/onboard", "fresh account → onboarding");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
