/**
 * Shared pure helpers for the ops CLI scripts (diagnose:auth, admin:create,
 * accounts:lock-test). The important one is parseDbTarget: every script must
 * be able to TELL YOU which database it is looking at without ever being
 * able to leak the credentials in the URL — so the parsing lives here, once,
 * and is unit-tested with credentialed inputs.
 */

export interface DbTarget {
  host: string;
  port: string | null;
  /** path minus leading slash — the database name */
  database: string;
  /** localhost/127.x/::1/`%`.local` style names — scripts skip the --yes
   * gate only for these */
  local: boolean;
}

export function parseDbTarget(url: string | undefined): DbTarget {
  if (!url) throw new Error("DATABASE_URL is not set — point it at the database to inspect");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    throw new Error(`DATABASE_URL must be a postgres URL (got ${u.protocol})`);
  }
  const host = u.hostname.toLowerCase();
  const local =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  return {
    host,
    port: u.port || null,
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    local,
  };
}

/** What a script may print about a target: host + db, never user:pass.
 * Belt-and-braces: if somehow credentials survive into the strings, strip. */
export function describeDbTarget(t: DbTarget): string {
  const safe = (s: string) => s.replace(/^[^/@]+@/, "").replace(/[:@/]/g, "-");
  return `postgres://${safe(t.host)}${t.port ? ":" + t.port : ""}/${safe(t.database)}`;
}

/** CLI gate: destructive/live writes to non-local DBs need explicit --yes. */
export function requireYesFor(target: DbTarget, argv: string[], what: string): void {
  if (target.local) return;
  if (!argv.includes("--yes")) {
    console.error(
      `REFUSING: ${what} targets ${describeDbTarget(target)} — that is not a local database.\n` +
        `Re-run with --yes once you are sure that is the intended database.`
    );
    process.exit(1);
  }
}

/** The seeded/test account domain (README publishes its password). Shared
 * predicate so create-admin's warning and the lock script never drift. */
export const TEST_EMAIL_DOMAIN = "@agora.test";
export function isTestDomainEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(TEST_EMAIL_DOMAIN);
}

/** CLI `--exclude <email>` / `--exclude=<email>`, repeatable; normalized
 * (trim+lowercase) and deduped. Pure so it is unit-testable. */
export function parseExclusions(argv: string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let v: string | null = null;
    if (a === "--exclude") v = argv[i + 1] ?? null;
    else if (a.startsWith("--exclude=")) v = a.slice("--exclude=".length);
    if (v === null) continue;
    const norm = v.trim().toLowerCase();
    if (norm) out.add(norm);
    i++; // consume the value form's argument (no-op for the = form)
  }
  return [...out];
}
