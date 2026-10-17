import crypto from "crypto";
import { prisma } from "./prisma";

/**
 * Single-use, hashed, expiring tokens for email verification and password
 * reset (docs/ARCHITECTURE.md §Auth). The plaintext token goes into the
 * email link ONCE; only its sha256 lives in the DB. Consumption is atomic
 * (updateMany ... where usedAt: null) so a token redeemed twice loses the
 * race and the second caller gets nothing.
 */

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

export type AuthTokenKind = "verify" | "reset";

export function randomToken(): string {
  return crypto.randomBytes(24).toString("base64url"); // 32 chars, URL-safe
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createAuthToken(
  userId: string,
  kind: AuthTokenKind,
  ttlMs: number = kind === "verify" ? VERIFY_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlMs);
  // A fresh request supersedes any outstanding token of the same kind
  // (reset twice = first link dies). Keep this BEFORE inserting: if the
  // insert fails there is at worst no valid token, never two.
  await prisma.authToken.deleteMany({ where: { userId, kind, usedAt: null } });
  await prisma.authToken.create({
    data: { userId, kind, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

/** Returns the owning userId iff the token exists, is unused, and has not
 * expired — and marks it used in the same breath. Otherwise null, with no
 * hint at which condition failed (the caller answers all failures with the
 * same generic message; no enumeration). */
export async function consumeAuthToken(token: string, kind: AuthTokenKind): Promise<string | null> {
  const now = new Date();
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, kind: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.kind !== kind || row.usedAt !== null || row.expiresAt <= now) return null;
  const claimed = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null; // lost the atomic-redeem race
  return row.userId;
}

/** Drop expired + long-used rows (cron- or op-maintenance helper). */
export async function purgeOldAuthTokens(): Promise<number> {
  const res = await prisma.authToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { lt: new Date(Date.now() - 7 * 86400_000) } }] },
  });
  return res.count;
}
