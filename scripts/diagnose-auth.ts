/**
 * npm run diagnose:auth — READ-ONLY login diagnostics.
 * Usage: DATABASE_URL="<connection string>" npm run diagnose:auth
 * Point DATABASE_URL at whatever deployment's database you want to inspect
 * (Vercel Production, Preview, or local). Prints no secrets: never the URL,
 * credentials, hashes — booleans and identifiers only.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseDbTarget, describeDbTarget } from "../lib/ops-db";

const target = parseDbTarget(process.env.DATABASE_URL);
const prisma = new PrismaClient();
let failed = false;

async function main() {
  console.log(`database: ${describeDbTarget(target)}`);

  // 1 ── migration status ──────────────────────────────────────────────────
  type MigRow = { migration_name: string; finished_at: Date | null };
  let applied: MigRow[] = [];
  try {
    applied = await prisma.$queryRaw<MigRow[]>`
      SELECT migration_name, finished_at FROM "_prisma_migrations"
      ORDER BY started_at`;
  } catch {
    console.log('migrations: no "_prisma_migrations" table — this DB looks db-push-managed (migrate deploy will not apply cleanly)');
  }
  if (applied.length) {
    console.log(`migrations applied: ${applied.map((m) => m.migration_name).join(", ") || "none"}`);
    const expected = [
      "20260909180545_init",
      "20260912150000_phase1",
      "20260915090000_manual_payments",
      "20260920120000_phase2_usage_domains_payouts",
      "20260921120000_usage_sources",
      "20261017130000_phase25_content",
      "20261017180000_phase0_accounts_engine",
    ];
    const pending = expected.filter((e) => !applied.some((a) => a.migration_name === e));
    console.log(`migrations pending vs this checkout: ${pending.length ? pending.join(", ") : "none"}`);
    if (pending.length) failed = true;
  }

  // 2 ── columns added since Phase 1.5 (P2022 tripwires) + tables ─────────
  const colRows: { table_name: string; column_name: string }[] = await prisma.$queryRaw`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'Business'       AND column_name IN ('customDomain','domainStatus','domainError','domainCheckedAt'))
       OR (table_name = 'PendingPayment' AND column_name IN ('userId','baseKobo','overageKobo','overageDetail','confirmedAt'))
       OR (table_name = 'UsageRecord'    AND column_name IN ('sources'))
       OR (table_name = 'User'           AND column_name IN ('isStaff','emailVerifiedAt','passwordChangedAt'))
       OR (table_name = 'Theme'          AND column_name IN ('slug','status','currentVersionId','developerId'))
       OR (table_name = 'Business'       AND column_name IN ('whatsappNumber','siteConfig','themeId'))`;
  const have = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));
  const want = [
    "Business.customDomain", "Business.domainStatus", "Business.domainError", "Business.domainCheckedAt",
    "PendingPayment.userId", "PendingPayment.baseKobo", "PendingPayment.overageKobo",
    "PendingPayment.overageDetail", "PendingPayment.confirmedAt", "UsageRecord.sources",
    "User.isStaff", "User.emailVerifiedAt", "User.passwordChangedAt",
    "Theme.slug", "Theme.status", "Theme.currentVersionId", "Theme.developerId",
    "Business.whatsappNumber", "Business.siteConfig", "Business.themeId",
  ];
  const missing = want.filter((w) => !have.has(w));
  console.log(`columns: ${want.length - missing.length}/${want.length} present${missing.length ? ` — MISSING: ${missing.join(", ")}` : ""}`);
  if (missing.length) failed = true;

  const tableRows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('UsageRecord','DevPayout','ThemeVersion','DeveloperProfile','AuthToken','LoginAttempt')`;
  const tablesHave = new Set(tableRows.map((r) => r.table_name));
  const tablesMissing = ["UsageRecord", "DevPayout", "ThemeVersion", "DeveloperProfile", "AuthToken", "LoginAttempt"].filter((t) => !tablesHave.has(t));
  console.log(`tables: ${["UsageRecord","DevPayout","ThemeVersion","DeveloperProfile","AuthToken","LoginAttempt"].map((n) => `${n} ${tablesHave.has(n) ? "✓" : "✗"}`).join(", ")}`);
  if (tablesMissing.length) failed = true;

  // 3 ── ThemeStatus enum + the Role enum being GONE (Phase 0) ─────────────
  const enums: { typname: string; enumlabel: string }[] = await prisma.$queryRaw`
    SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ('ThemeStatus','Role','AuthTokenKind')`;
  const themeStatus = new Set(enums.filter((r) => r.typname === "ThemeStatus").map((r) => r.enumlabel));
  const enumMissing = ["draft", "in_review", "published", "rejected", "unlisted"].filter((l) => !themeStatus.has(l));
  console.log(`ThemeStatus enum: [${[...themeStatus].sort().join(", ")}]${enumMissing.length ? ` — MISSING ${enumMissing.join(", ")}` : ""}`);
  if (enumMissing.length) failed = true;
  if (enums.some((r) => r.typname === "Role")) {
    console.log("NOTE: legacy Role enum still present — expected until 20261017180000 is applied (harmless if User.role is gone)");
  }

  // 4 ── the seeded test accounts, and whether login COULD work ───────────
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@agora.test" } },
    select: { email: true, isStaff: true, emailVerifiedAt: true },
    orderBy: { email: "asc" },
  });
  if (users.length === 0) {
    console.log("test accounts: NONE — seeded users do not exist in this database (wrong-DB hypothesis CONFIRMED if you expected them)");
    failed = true;
  } else {
    for (const u of users) {
      const full = await prisma.user.findUnique({
        where: { email: u.email },
        select: { password: true },
      });
      const hash = full?.password ?? "";
      const looksBcrypt = /^\$2[aby]\$\d{2}\$/.test(hash);
      // boolean only — the hash itself is never printed
      const matches = looksBcrypt ? await bcrypt.compare("password123", hash) : false;
      console.log(`account: ${u.email} staff=${u.isStaff} verified=${u.emailVerifiedAt ? "yes" : "NO"} bcryptHash=${looksBcrypt} matchesSeededPassword=${matches}`);
      if (!matches) failed = true;
    }
  }

  console.log(
    failed
      ? "\nRESULT: this database would make login fail or pages crash — see the lines above."
      : "\nRESULT: schema, accounts, and hashes all check out for this database."
  );
}

main()
  .catch((err) => {
    console.error(`diagnose failed: ${err instanceof Error ? err.message.slice(0, 200) : "error"}`);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
