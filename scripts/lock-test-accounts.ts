/**
 * npm run accounts:lock-test — neutralize the public README test accounts
 * in whatever database you point at.
 *
 * For every user whose email ends with @agora.test: replace the password
 * with a fresh 32-byte random value (hashed with bcryptjs cost 12), then
 * DISCARD the plaintext — it exists only inside this process, never
 * printed, never stored anywhere recoverable. The account rows themselves
 * stay (businesses, themes, payout history remain intact and attributable);
 * they just can never be signed into again.
 *
 * Idempotent-ish by nature: re-running re-locks already-locked accounts.
 * Prints only the affected count. Requires --yes for non-local databases.
 *
 *   DATABASE_URL=... npm run accounts:lock-test -- --yes
 */
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseDbTarget, describeDbTarget, parseExclusions } from "../lib/ops-db";

const target = parseDbTarget(process.env.DATABASE_URL);
const prisma = new PrismaClient();

try {
  const candidates = await prisma.user.findMany({
    where: { email: { endsWith: "@agora.test" } },
    select: { id: true, email: true },
    orderBy: { id: "asc" },
  });
  if (candidates.length === 0) {
    console.log("No @agora.test accounts found — nothing to lock.");
    process.exit(0);
  }
  // --exclude keeps named accounts (e.g. an admin bootstrapped onto the
  // test email during the test phase) while locking every other one.
  const exclude = new Set(parseExclusions(process.argv));
  const locked: typeof candidates = [];
  let excluded = 0;
  for (const c of candidates) {
    if (exclude.has(c.email.toLowerCase())) excluded++;
    else locked.push(c);
  }
  if (excluded) console.log(`excluded (kept usable): ${excluded}`);
  if (locked.length === 0) {
    console.log("every candidate was excluded — nothing to lock");
    process.exit(0);
  }
  console.log(`${locked.length} test account(s) to lock @ ${describeDbTarget(target)}`);
  if (!process.argv.includes("--yes")) {
    console.error("dry run: re-run with --yes to actually lock them");
    process.exit(1);
  }
  for (const c of locked) {
    const hash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
    await prisma.user.update({ where: { id: c.id }, data: { password: hash } });
  }
  console.log(`locked: ${locked.length}`);
} catch (err) {
  console.error(`failed: ${err instanceof Error ? err.message.split("\n")[0] : "error"}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
