/**
 * npm run migrate:check — apply the ENTIRE migration history against a real
 * Postgres (PGlite: Postgres compiled to WASM; in-process, no server, no
 * network) and smoke-prove the content CHECK constraints by inserting rows.
 *
 * Why this exists: hand-written migration SQL reviewed against schema.prisma
 * still hides constructs that only error at APPLY time on real Postgres —
 * the Phase 2.5 migration's CHECK used NOT EXISTS (SELECT … FROM unnest(…))
 * and Neon rejected it with SQLSTATE 0A000 ("cannot use subquery in check
 * constraint"). A shadow-diff cannot catch that; execution can.
 *
 * Deterministic: starts from an empty database every run. Exits non-zero on
 * any migration failure or any CHECK behaving other than specified.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dir = join(process.cwd(), "prisma", "migrations");
const names = readdirSync(dir)
  .filter((d) => /^\d{14}_/.test(d))
  .sort();

const db = new PGlite();
let failed = 0;

for (const name of names) {
  const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
  try {
    await db.exec(sql);
    console.log(`apply ${name}: OK`);
  } catch (err) {
    failed++;
    const line = String(err?.message ?? err).split("\n")[0];
    console.error(`apply ${name}: FAILED — ${line}`);
  }
}
if (failed) {
  console.error(`migrate:check: ${failed} migration(s) do not apply cleanly`);
  process.exit(1);
}

// ── CHECK-contract probes ────────────────────────────────────────────────────
// Copy only the CHECK constraints onto a free-standing table so probes never
// trip FKs or unique indexes and cannot pollute the migrated schema.
await db.exec(`CREATE TABLE _probe (LIKE "Product" INCLUDING CONSTRAINTS INCLUDING DEFAULTS);`);

const base = `INSERT INTO _probe ("id","businessId","name","imageUrls","priceKobo","sortOrder","inStock","createdAt","updatedAt") VALUES ('p1','b1','n',`;
const probes = [
  { sql: `${base}'{}'::text[], 10, 0, true, now(), now())`, want: "ok", name: "empty array" },
  { sql: `${base}NULL, 10, 0, true, now(), now())`, want: "ok", name: "null array" },
  {
    sql: `${base}'{"https://s.public.blob.vercel-storage.com/a.png","https://s.public.blob.vercel-storage.com/b.png"}'::text[], 10, 0, true, now(), now())`,
    want: "ok",
    name: "two https urls",
  },
  {
    sql: `${base}'{"https://s.public.blob.vercel-storage.com/a,b.png"}'::text[], 10, 0, true, now(), now())`,
    want: "ok",
    name: "comma in url (quoted serialization) accepted",
  },
  {
    sql: `${base}'{"http://evil.example/a.png"}'::text[], 10, 0, true, now(), now())`,
    want: "reject",
    name: "http rejected",
  },
  {
    sql: `${base}'{"https://ok.example/a.png","/relative/b.png"}'::text[], 10, 0, true, now(), now())`,
    want: "reject",
    name: "relative path rejected",
  },
  {
    sql: `${base}'{"https://a","https://b","https://c","https://d","https://e","https://f"}'::text[], 10, 0, true, now(), now())`,
    want: "reject",
    name: "6 images rejected (cap 5)",
  },
  {
    sql: `INSERT INTO _probe ("id","businessId","name","updatedAt") VALUES ('p2','b2','${"x".repeat(121)}',now())`,
    want: "reject",
    name: "121-char name rejected (max 120)",
  },
  {
    sql: `INSERT INTO _probe ("id","businessId","name","priceKobo","updatedAt") VALUES ('p3','b2','n',-1,now())`,
    want: "reject",
    name: "negative price rejected",
  },
];

let pass = 0;
for (const p of probes) {
  let got;
  try {
    await db.exec(`BEGIN; ${p.sql}; ROLLBACK;`);
    got = "ok";
  } catch {
    got = "reject";
  }
  if (got === p.want) {
    pass++;
  } else {
    failed++;
    console.error(`CHECK probe "${p.name}": expected ${p.want}, got ${got}`);
  }
}

await db.close();
console.log(
  `migrate:check: ${names.length} migrations apply cleanly; ${pass}/${probes.length} CHECK probes behaved as specified`
);
process.exit(failed ? 1 : 0);
