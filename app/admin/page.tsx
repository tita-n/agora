import Link from "next/link";
import { requireStaff, prisma } from "@/lib/auth";
import { formatNaira } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * /admin — landing overview (this commit). Four numbers you actually
 * triage from, each linking to the page that acts on it. Counts only:
 * deliberately no lists here, because the list pages are where actions
 * (and their audit trails) live.
 *
 * Reads: pending/processing payment queue size, total owed across ALL
 * developer payout rows, and businesses by subscription status. Explicit
 * selects everywhere; money formatted with the platform's Intl-free helper.
 */
export default async function AdminHomePage() {
  await requireStaff();

  const [pendingCount, processingCount, owedRows, activeCount, pastDueCount, inactiveCount] =
    await Promise.all([
      prisma.pendingPayment.count({ where: { status: "pending" } }),
      prisma.pendingPayment.count({ where: { status: "processing" } }),
      prisma.devPayout.findMany({
        where: { status: "owed" },
        select: { amountKobo: true },
      }),
      prisma.business.count({ where: { subscriptionStatus: "active" } }),
      prisma.business.count({ where: { subscriptionStatus: "past_due" } }),
      prisma.business.count({ where: { subscriptionStatus: "inactive" } }),
    ]);

  const owedTotal = (owedRows as { amountKobo: number }[]).reduce(
    (s, x) => s + x.amountKobo,
    0
  );

  return (
    <div className="space-y-5 py-2">
        <h1 className="text-2xl font-bold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-ink-muted">Platform state at a glance — every card leads to its action page.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/admin/payments"
            className="block rounded-md border border-rule bg-card p-5 hover:border-rule-strong"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Payment queue
            </h2>
            <p className="mt-2 text-2xl font-bold text-ink">
              {pendingCount}
              <span className="ml-1 text-sm font-medium text-ink-muted">waiting</span>
            </p>
            {processingCount > 0 && (
              <p className="mt-1 text-xs font-medium text-warn">
                {processingCount} processing — stuck rows need investigation
              </p>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              Manual transfers awaiting confirmation →
            </p>
          </Link>

          <Link
            href="/admin/payouts"
            className="block rounded-md border border-rule bg-card p-5 hover:border-rule-strong"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Owed to developers
            </h2>
            <p className="mt-2 text-2xl font-bold text-ink">{formatNaira(owedTotal)}</p>
            <p className="mt-2 text-xs text-ink-faint">
              Across all “owed” payout rows — transfers stay manual →
            </p>
          </Link>

          <section className="rounded-md border border-rule bg-card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Businesses
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-faint">active</dt>
                <dd className="text-xl font-bold text-success">{activeCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-faint">past due</dt>
                <dd className="text-xl font-bold text-warn">{pastDueCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-faint">inactive</dt>
                <dd className="text-xl font-bold text-ink-muted">{inactiveCount}</dd>
              </div>
            </dl>
          </section>

          <Link
            href="/admin/ops"
            className="block rounded-md border border-rule bg-card p-5 hover:border-rule-strong"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Operations
            </h2>
            <p className="mt-2 text-sm font-medium text-ink">
              Run the background jobs manually
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              usage snapshot · renewals · past-due sweep · payouts →
            </p>
          </Link>
        </div>
    </div>
  );
}
