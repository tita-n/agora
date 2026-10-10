/**
 * npm run admin:create — safe admin bootstrap for live databases.
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from the ENVIRONMENT ONLY (argv would
 * land in shell history and `ps`; env for one command is the safe channel).
 * Passwords never printed, never logged; hash generated at cost 12 — the
 * same bcryptjs the app verifies against.
 *
 *   DATABASE_URL=... ADMIN_EMAIL=you@real.com ADMIN_PASSWORD='…' npm run admin:create -- --yes
 *
 * Guards:
 *  - prints the database host+name it is about to write to (never the URL);
 *  - requires --yes unless the host is localhost;
 *  - refuses to CHANGE THE ROLE of an existing user unless --force-role
 *    (demoting/promoting by accident is the dangerous part, resetting your
 *    own admin password is not);
 *  - password policy: >= 12 chars, checked here so a short one can never
 *    become a live credential.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { parseDbTarget, describeDbTarget, requireYesFor } from "../lib/ops-db";

const target = parseDbTarget(process.env.DATABASE_URL);

const email = z
  .string()
  .email("ADMIN_EMAIL is missing or not a valid email")
  .transform((s) => s.trim().toLowerCase());
const password = z
  .string()
  .min(12, "ADMIN_PASSWORD must be at least 12 characters");

let parsedEmail: string;
let parsedPassword: string;
try {
  parsedEmail = email.parse(process.env.ADMIN_EMAIL);
  parsedPassword = password.parse(process.env.ADMIN_PASSWORD);
} catch (err) {
  for (const issue of (err as z.ZodError).issues) {
    console.error(`input: ${issue.message}`);
  }
  console.error("nothing was written");
  process.exit(1);
}

requireYesFor(target, process.argv, "admin:create");

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({
    where: { email: parsedEmail },
    select: { id: true, role: true },
  });
  const hash = await bcrypt.hash(parsedPassword, 12);

  if (existing && existing.role !== "admin" && !process.argv.includes("--force-role")) {
    console.error(
      `REFUSING: ${parsedEmail} already exists with role "${existing.role}".\n` +
        `Changing an account's ROLE is a separate decision — re-run with --force-role if that is truly intended.`
    );
    process.exit(1);
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hash, role: "admin" },
    });
    console.log(
      `${existing.role === "admin" ? "password reset for" : "role changed to admin for"} ${parsedEmail} @ ${describeDbTarget(target)}`
    );
  } else {
    await prisma.user.create({
      data: { email: parsedEmail, password: hash, role: "admin" },
    });
    console.log(`created admin ${parsedEmail} @ ${describeDbTarget(target)}`);
  }
} catch (err) {
  // message only — Prisma connection errors can embed the URL host, which
  // is fine for the operator, but never echo more than one line.
  console.error(`write failed: ${err instanceof Error ? err.message.split("\n")[0] : "error"}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
