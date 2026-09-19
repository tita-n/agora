/**
 * Phase 2 unit tests — pure modules only (billing, domains, routing,
 * analytics parsing). Run: npx tsx scripts/phase2-units.ts
 * Deliberately no prisma/network: these pin the money math + the security-
 * relevant normalization, which is what the stubbed client can't verify.
 */
import { calculateOverageKobo, overageLines } from "../lib/billing/overage";
import {
  devShareKobo,
  computeOwedKobo,
  previousCalendarMonth,
} from "../lib/billing/payouts";
import { normalizeCustomDomain, DOMAIN_HOST_RE } from "../lib/domains";
import {
  classifyHost,
  tenantRewritePath,
  tenantHostRewritePath,
} from "../lib/tenant";
import { parseDailyUsage } from "../lib/vercel/analytics";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}`);
  }
}

// ── 1. overage: FUP boundaries ───────────────────────────────────────────
eq(calculateOverageKobo({ bandwidthGb: 5.999, blobStorageGb: 0.0049, blobTransferGb: 1.999 }),
  { bandwidthOverageKobo: 0, storageOverageKobo: 0, transferOverageKobo: 0, totalOverageKobo: 0 },
  "just-under-FUP is exactly zero");
eq(calculateOverageKobo({ bandwidthGb: 6, blobStorageGb: 0.005, blobTransferGb: 2 }),
  { bandwidthOverageKobo: 0, storageOverageKobo: 0, transferOverageKobo: 0, totalOverageKobo: 0 },
  "exactly-at-FUP is zero (inclusive allowance)");
eq(calculateOverageKobo({ bandwidthGb: 6.001, blobStorageGb: 0.006, blobTransferGb: 2.001 }),
  { bandwidthOverageKobo: 50, storageOverageKobo: 10, transferOverageKobo: 20, totalOverageKobo: 80 },
  "first kobo over each threshold prices at the exact rates");

// ── 2. the modeled reference scenarios (settled numbers, not placeholders) ─
const light = calculateOverageKobo({ bandwidthGb: 2.4, blobStorageGb: 0.0031, blobTransferGb: 0.8 });
eq(light, { bandwidthOverageKobo: 0, storageOverageKobo: 0, transferOverageKobo: 0, totalOverageKobo: 0 },
  "typical info/service business profile → ₦0 (near-zero requirement)");

const ecom = calculateOverageKobo({ bandwidthGb: 10, blobStorageGb: 0.146, blobTransferGb: 40 });
eq(ecom,
  { bandwidthOverageKobo: 200_000, storageOverageKobo: 1_410, transferOverageKobo: 760_000, totalOverageKobo: 961_410 },
  "e-commerce default profile (10GB / 0.146GB / 40GB) = ₦2,000 + ~₦14 + ₦7,600");
ok(ecom.totalOverageKobo >= 961_300 && ecom.totalOverageKobo <= 961_500,
  "total overage lands on the ₦9,614 reference (±₦1 kobo-rounding band)");
eq(overageLines({ bandwidthGb: 10, blobStorageGb: 0.146, blobTransferGb: 40 }, ecom).length, 3,
  "itemization has exactly the three charged lines");
eq(overageLines({ bandwidthGb: 1, blobStorageGb: 0, blobTransferGb: 1 }, calculateOverageKobo({ bandwidthGb: 1, blobStorageGb: 0, blobTransferGb: 1 })), [],
  "zero-overage bills itemize nothing");

// ── 3. garbage-in safety ─────────────────────────────────────────────────
eq(calculateOverageKobo({ bandwidthGb: NaN, blobStorageGb: -3, blobTransferGb: Infinity }),
  { bandwidthOverageKobo: 0, storageOverageKobo: 0, transferOverageKobo: 0, totalOverageKobo: 0 },
  "garbage usage rows price ₦0, never throw, never go negative");

// ── 4. payout ledger math (settled split policy) ─────────────────────────
eq(devShareKobo(500_000), 350_000, "70% of ₦5,000 theme = ₦3,500");
eq(devShareKobo(49_999), 34_999, "floor-per-payment favors the platform");
eq(devShareKobo(0), 0, "non-positive prices pay nothing");
eq(devShareKobo(Number.NaN), 0, "NaN price pays nothing");
eq(computeOwedKobo([500_000, 500_000, 49_999]), 734_999, "one month of three payments aggregates with per-payment flooring");
{
  const { periodStart, periodEnd } = previousCalendarMonth(new Date(Date.UTC(2026, 8, 19)));
  eq(periodStart.toISOString(), "2026-08-01T00:00:00.000Z", "Sept run covers August");
  eq(periodEnd.toISOString(), "2026-09-01T00:00:00.000Z", "window is half-open at month start");
  const jan = previousCalendarMonth(new Date(Date.UTC(2026, 0, 15)));
  eq(jan.periodStart.toISOString(), "2025-12-01T00:00:00.000Z", "year boundary rolls back to Dec");
}

// ── 5. custom-domain normalization (the security boundary) ────────────────
eq(normalizeCustomDomain("  https://Shop.Example.com./ ", "agora.test"), { ok: true, domain: "shop.example.com" },
  "protocol/space/trailing-dot/case all normalized away");
eq(normalizeCustomDomain("xn--80ak6aa92e.com", "agora.test"), { ok: true, domain: "xn--80ak6aa92e.com" },
  "punycode accepted");
eq(normalizeCustomDomain("a", "agora.test").ok, false, "single label rejected");
eq(normalizeCustomDomain("agora.test", "agora.test").ok, false, "platform root itself rejected");
eq(normalizeCustomDomain("x.agora.test", "agora.test").ok, false, "subdomain of root rejected (platform namespace)");
eq(normalizeCustomDomain("a.vercel.app", "agora.test").ok, false, "vercel.app hosts rejected");
eq(normalizeCustomDomain("*.example.com", "agora.test").ok, false, "wildcards rejected");
eq(normalizeCustomDomain("example.com:8080", "agora.test").ok, false, "ports rejected");
eq(normalizeCustomDomain("bücher.de", "agora.test").ok, false, "non-ASCII must arrive punycoded");
eq(normalizeCustomDomain("example.c", "agora.test").ok, false, "1-char TLD rejected");
eq(DOMAIN_HOST_RE.test("1.2.3.4"), false, "raw IPs are not domains");
ok(DOMAIN_HOST_RE.test("a".repeat(63) + ".example.com"), "63-char label is a legal DNS label");
ok(!DOMAIN_HOST_RE.test("a".repeat(64) + ".example.com"), "64-char label rejected");

// ── 6. host routing (M-1/M-2 rules preserved; Phase 2 additions) ─────────
eq(classifyHost("agora.test", "agora.test", true), { kind: "main" }, "apex → main");
eq(classifyHost("www.agora.test:3000", "agora.test", true), { kind: "main" }, "www.root (port stripped) → main");
eq(classifyHost("acme.agora.test", "agora.test", true), { kind: "tenant", subdomain: "acme" }, "valid sub → tenant");
eq(classifyHost("admin.agora.test", "agora.test", true), { kind: "invalid" }, "reserved label → invalid, not main");
eq(classifyHost("a.b.agora.test", "agora.test", true), { kind: "invalid" }, "nested label → invalid (M-1)");
eq(classifyHost("evil%.com", "agora.test", true), { kind: "invalid" }, "garbage host in strict mode → invalid, no DB hit");
eq(classifyHost("shop.example.com", "agora.test", true), { kind: "tenantHost", hostname: "shop.example.com" }, "valid foreign host (strict) → custom-domain candidate");
eq(classifyHost("shop.example.com", "agora.test", false), { kind: "main" }, "foreign host in dev/preview → main (unchanged)");
eq(classifyHost("localhost:3000", "agora.test", false), { kind: "main" }, "localhost dev untouched (M-2)");
eq(tenantRewritePath("acme", "/about/"), "/sites/acme/about", "subdomain path trim preserved");
eq(tenantHostRewritePath("/"), "/tenant-host", "custom host root");
eq(tenantHostRewritePath("/about/"), "/tenant-host/about", "custom host sub-path trims trailing slash");

// ── 7. analytics response parsing (defensive, unit-translation) ──────────
{
  const hosts = parseDailyUsage({
    days: [
      { date: "2026-09-01", domains: [
        { name: "Acme.Example.com", dataTransferred: 1.5e9, requests: 10 },
        { name: "other.example.com", dataTransferred: "garbage", requests: null },
        { dataTransferred: 5e8 },
      ] },
      { date: "2026-09-02", domains: [
        { name: "acme.example.com", dataTransferred: 5e8, requests: 5 },
      ] },
    ],
  });
  eq(hosts["acme.example.com"], { bandwidthGb: 2, requests: 15 }, "per-host totals merge across days, case-folded, bytes→GB");
  eq(hosts["other.example.com"], { bandwidthGb: 0, requests: 0 }, "garbage numbers read as 0, entry kept (explicit zero ≠ missing)");
  eq(parseDailyUsage(null), {}, "null response → empty map, no throw");
  eq(parseDailyUsage({ days: "not-an-array" }), {}, "malformed days → empty map");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
