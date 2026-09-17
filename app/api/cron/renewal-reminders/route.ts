import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { chargeAmountKobo } from "@/lib/paystack";
import { generateReference } from "@/lib/payments/reference";
import { manualBankConfig } from "@/lib/payments/manual-format";
import { formatNaira } from "@/lib/money";
import { sendEmail, reminderEmailHtml } from "@/lib/email";
import { tenantSiteUrl } from "@/lib/site-urls";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_WITHIN_DAYS = 3;

/**
 * GET /api/cron/renewal-reminders  (Vercel Cron, daily — see vercel.json)
 *
 * For every active business whose nextBillingDate falls within the next
 * 3 days (overdue included): mint a fresh AGORA-XXXXXX reference, store a
 * kind="renewal" PendingPayment for the admin queue, and email the bank
 * instructions to the owner (or log them if email isn't wired up — by design
 * this feature never blocks on an email provider). Confirmation of renewals
 * happens in the SAME /admin/payments panel as signups.
 *
 * Dedup: a business never accumulates more than one live (pending/processing)
 * renewal row — the reminder repeats daily only while the previous one is
 * rejected/absent, which is the intended "automatic nagging".
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"), env.CRON_SECRET, process.env.NODE_ENV === "production")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const due = await prisma.business.findMany({
    where: {
      subscriptionStatus: "active",
      nextBillingDate: { not: null, lte: new Date(now + REMIND_WITHIN_DAYS * DAY_MS) },
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
      nextBillingDate: true,
      ownerId: true,
      theme: { select: { price: true } },
      owner: { select: { email: true } }, // explicit select — never User.* (H-1)
    },
  });

  let reminded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const b of due) {
    try {
      const alreadyPending = await prisma.pendingPayment.findFirst({
        where: { businessId: b.id, kind: "renewal", status: { in: ["pending", "processing"] } },
        select: { id: true },
      });
      if (alreadyPending) {
        skipped++;
        continue;
      }

      let amountKobo: number;
      try {
        amountKobo = chargeAmountKobo(b.theme?.price ?? 0); // same formula, same >0 guard
      } catch {
        errors.push(`${b.subdomain}: theme price unset/invalid — skipped`);
        continue;
      }

      const reference = await generateReference((ref) =>
        prisma.pendingPayment
          .findUnique({ where: { reference: ref }, select: { id: true } })
          .then((r: { id: string } | null) => Boolean(r))
      );
      await prisma.pendingPayment.create({
        data: { reference, kind: "renewal", amountKobo, userId: b.ownerId, businessId: b.id },
      });

      const bank = manualBankConfig();
      const body = bank
        ? reminderEmailHtml({
            businessName: b.name,
            amountKobo: formatNaira(amountKobo),
            reference,
            bankName: bank.bankName,
            accountName: bank.accountName,
            accountNumber: bank.accountNumber,
            contactUrl: tenantSiteUrl(b.subdomain),
          })
        : `<p>Renewal ${reference} (${formatNaira(amountKobo)}) for ${b.name} — bank details not configured (MANUAL_BANK_* env).</p>`;
      await sendEmail({
        to: b.owner.email,
        subject: `Renew your Agora site — reference ${reference}`,
        html: body,
      });
      reminded++;
    } catch (err) {
      errors.push(`${b.subdomain}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const summary = { due: due.length, reminded, skipped, errors };
  console.log(`[cron:renewal-reminders] ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
