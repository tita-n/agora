/**
 * npm run test:ops — unit tests for the auth-error classification, email
 * normalization, and DB-target parsing (the secret-redaction boundary).
 * Pure functions only; run: npx tsx scripts/ops-units.ts
 */
import {
  loginErrorMessage,
  classifyThrown,
  normalizeEmail,
  AUTH_INFRA_ERROR_CODE,
  INVALID_CREDENTIALS_MESSAGE,
  INFRA_FAILURE_MESSAGE,
} from "../lib/auth-errors";
import { parseDbTarget, describeDbTarget, parseExclusions, isTestDomainEmail } from "../lib/ops-db";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}

// ── loginErrorMessage: the honesty mapping ───────────────────────────────
eq(loginErrorMessage(null), "", "no error → no message");
eq(loginErrorMessage(undefined), "", "undefined → no message");
eq(loginErrorMessage(AUTH_INFRA_ERROR_CODE), INFRA_FAILURE_MESSAGE, "infra code → distinct friendly message");
eq(loginErrorMessage("CredentialsSignin"), INVALID_CREDENTIALS_MESSAGE, "wrong creds → the one generic message");
eq(loginErrorMessage("AccessDenied"), INVALID_CREDENTIALS_MESSAGE, "access denied → same generic (no oracle)");
eq(loginErrorMessage("SomeUnknownNextAuthError"), INVALID_CREDENTIALS_MESSAGE, "unknown code collapses to generic, never echoed");
eq(loginErrorMessage(INFRA_FAILURE_MESSAGE), INVALID_CREDENTIALS_MESSAGE, "a spoofed raw message string is not trusted as a signal");
eq(loginErrorMessage(""), "", "empty string → no message");

// ── classifyThrown: what counts as infrastructure ─────────────────────────
class FakePrismaError extends Error {
  constructor() {
    super("Can't reach database server");
    this.name = "PrismaClientInitializationError";
  }
}
eq(classifyThrown(new FakePrismaError()), "infrastructure", "prisma error → infrastructure");
eq(classifyThrown(new Error("Cannot read properties of undefined")), "unexpected", "plain bug → unexpected");
const typeErr = new TypeError("fetch failed");
(typeErr as { cause?: unknown }).cause = new Error("ECONNREFUSED");
eq(classifyThrown(typeErr), "infrastructure", "TypeError with cause (network) → infrastructure");
eq(classifyThrown(new TypeError("x")), "unexpected", "bare TypeError is our bug, not the DB's");
const abort = new Error("aborted");
abort.name = "AbortError";
eq(classifyThrown(abort), "infrastructure", "AbortError → infrastructure");
eq(classifyThrown("a string"), "unexpected", "non-Error never classified as infra");

// ── normalizeEmail ───────────────────────────────────────────────────────
eq(normalizeEmail(" Admin@Agora.test\n"), "admin@agora.test", "trim + lowercase");
eq(normalizeEmail(undefined), "", "missing → empty (falls into the invalid path)");
eq(normalizeEmail(42), "", "non-string → empty");

// ── parseDbTarget / describeDbTarget: the redaction boundary ─────────────
const t1 = parseDbTarget("postgresql://user:topsecret@localhost:5432/agora_dev");
eq([t1.host, t1.port, t1.database, t1.local], ["localhost", "5432", "agora_dev", true], "local URL parsed");
eq(describeDbTarget(t1), "postgres://localhost:5432/agora_dev", "describe omits user+password");

const t2 = parseDbTarget("postgresql://neonuser:nh_extremely_secret@ep-cool-123.us-east-2.aws.neon.tech/dbname?sslmode=require");
const desc = describeDbTarget(t2);
eq(t2.local, false, "neon host is NOT local");
eq(
  [desc.includes("neonuser"), desc.includes("nh_extremely_secret"), desc.includes("ep-cool-123"), desc.includes("dbname")],
  [false, false, true, true],
  "describe leaks NO credentials but names host+db"
);

let threw = false;
try {
  parseDbTarget("mysql://u:p@h/db");
} catch {
  threw = true;
}
eq(threw, true, "non-postgres protocol rejected");

threw = false;
try {
  parseDbTarget(undefined);
} catch {
  threw = true;
}
eq(threw, true, "missing DATABASE_URL rejected loudly");


// ── parseExclusions / isTestDomainEmail ───────────────────────────────────
eq(parseExclusions(["node", "x"]), [], "no flags → empty");
eq(
  parseExclusions(["--exclude", " Admin@Agora.test ", "--exclude=owner@agora.test", "--exclude", "owner@agora.test"]),
  ["admin@agora.test", "owner@agora.test"],
  "both forms, normalized, deduped"
);
eq(parseExclusions(["--exclude"]), [], "dangling --exclude → nothing");
eq(parseExclusions(["--exclude="]), [], "--exclude= with empty value → nothing");
eq(isTestDomainEmail("ADMIN@agora.test "), true, "test-domain predicate trims+lowercases");
eq(isTestDomainEmail("you@real.com"), false, "real email is not test-domain");
eq(isTestDomainEmail("agora.test@example.com"), false, "domain must SUFFIX the address");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
