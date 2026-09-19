import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { calculateOverageKobo } from "@/lib/billing/overage";
import { SUBSCRIPTION_PERIOD_MS } from "@/lib/onboarding";
import { fetchDailyUsageByHost, type DailyUsageOutcome } from "@/lib/vercel/analytics";
import { ownerBlobBytes, bytesToGb } from "@/lib/vercel/blob-meter";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/usage-snapshot  (Vercel Cron, daily 06:55 UTC — five
 * minutes BEFORE the renewal-reminders cron so a bill that goes out this
 * morning prices against this morning's snapshot of the period closing
 * today.)
 *
 * Upserts ONE UsageRecord per business per billing period
 * [nextBillingDate − 30d, nextBillingDate) accumulating per FIELD:
 *
 *  - blobStorageGb  — EXACT, always (Blob SDK list, any plan) — the only
 *    overage source that is live from day one.
 *  - bandwidthGb    — Vercel Analytics daily-usage, when configured AND
 *    Vercel reports the business's host as its own domain entry (verified
 *    custom domains: yes; wildcard subdomains: plan/config-dependent).
 *    Otherwise the existing value (manual UPDATE or previous snapshot) is
 *    KEPT — never zeroed, never guessed.
 *  - blobTransferGb — no per-business source exists on the platform API
 *    today (Blob usage is team-wide). Value is operator-seeded only, same
 *    keep-don't-zero rule.
 *
 * So until the Analytics entitlement exists, bandwidth/transfer overage
 * billing is DORMANT (₦0) rather than estimated, and each line of the log
 * states which source each field came from — when you upgrade the plan,
 * the day the numbers start saying source=api is the auditable point where
 * they became fully real.
 */

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"), env.CRON_SECRET, process.env.NODE_ENV === "production")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businesses = await prisma.business.findMany({
    where: { subscriptionStatus: { in: ["active", "past_due"] }, nextBillingDate: { not: null } },
    select: {
      id: true,
      subdomain: true,
      ownerId: true,
      nextBillingDate: true,
      customDomain: true,
      domainStatus: true,
    },
  });

  const rootDomain = (env.ROOT_DOMAIN || "agora.test").split(":")[0].toLowerCase();
  const earliestPeriodStart = businesses.length
    ? Math.min(...(businesses as { nextBillingDate: Date }[]).map((b) => b.nextBillingDate.getTime())) -
      SUBSCRIPTION_PERIOD_MS
    : Date.now();
  const analytics: DailyUsageOutcome = businesses.length
    ? await fetchDailyUsageByHost(new Date(earliestPeriodStart), new Date())
    : { status: "ok", hosts: {} };
  // One analytics call for the whole team — per-business attribution just
  // filters its result. If the plan doesn't expose the endpoint, `reason`
  // goes into every per-business log line so the dormancy is explicit.
  const analyticsNote =
    analytics.status === "ok" ? "api" : analytics.status === "unconfigured" ? "api:unset" : `api:${analytics.reason}`;

  let updated = 0;
  let created = 0;
  const lines: string[] = [];

  type Row = {
    id: string;
    subdomain: string;
    ownerId: string;
    nextBillingDate: Date;
    customDomain: string | null;
    domainStatus: string;
  };
  for (const b of businesses as Row[]) {
    try {
      const periodEnd = b.nextBillingDate;
      const periodStart = new Date(periodEnd.getTime() - SUBSCRIPTION_PERIOD_MS);

      const existing = await prisma.usageRecord.findFirst({
        where: { businessId: b.id, periodStart },
        select: { id: true, bandwidthGb: true, blobStorageGb: true, blobTransferGb: true },
      });

      // ── blob storage: exact via SDK (kept on transient failure) ────────
      let blobStorageGb = existing?.blobStorageGb ?? 0;
      let storageSource = "kept";
      const blob = await ownerBlobBytes(b.ownerId);
      if (blob.status === "ok") {
        blobStorageGb = bytesToGb(blob.bytes);
        storageSource = `sdk(${blob.blobs} blobs)`;
      } else if (blob.status === "unavailable") {
        storageSource = `kept(${blob.reason})`;
      }

      // ── bandwidth: analytics attribution by hostname ───────────────────
      let bandwidthGb = existing?.bandwidthGb ?? 0;
      let bandSource = "kept";
      const hosts = new Set<string>([`${b.subdomain}.${rootDomain}`]);
      if (b.domainStatus === "verified" && b.customDomain) hosts.add(b.customDomain);
      if (analytics.status === "ok") {
        const matched = [...hosts].map((h) => analytics.hosts[h]).filter(Boolean);
        if (matched.length > 0) {
          bandwidthGb = matched.reduce((s, h) => s + h.bandwidthGb, 0);
          bandSource = analyticsNote;
        } else {
          bandSource = "kept(no host in response)";
        }
      } else {
        bandSource = `kept(${analyticsNote})`;
      }

      // ── blob transfer: operator-seeded only, by design (see header) ────
      const blobTransferGb = existing?.blobTransferGb ?? 0;

      const overageKobo = calculateOverageKobo({
        bandwidthGb,
        blobStorageGb,
        blobTransferGb,
      }).totalOverageKobo;

      if (existing) {
        await prisma.usageRecord.update({
          where: { id: existing.id },
          data: { periodEnd, bandwidthGb, blobStorageGb, blobTransferGb, overageKobo },
        });
        updated++;
      } else {
        await prisma.usageRecord.create({
          data: { businessId: b.id, periodStart, periodEnd, bandwidthGb, blobStorageGb, blobTransferGb, overageKobo },
        });
        created++;
      }
      lines.push(
        `${b.subdomain}: bandwidth=${bandwidthGb.toFixed(3)}GB[${bandSource}] storage=${blobStorageGb.toFixed(4)}GB[${storageSource}] transfer=${blobTransferGb.toFixed(3)}GB[manual] overageKobo=${overageKobo}`
      );
    } catch (err) {
      lines.push(`${b.subdomain}: ERROR ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const summary = {
    businesses: businesses.length,
    created,
    updated,
    analytics: analyticsNote,
    details: lines,
  };
  console.log(`[cron:usage-snapshot] ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
