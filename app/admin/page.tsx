import Link from "next/link";
import { requireRole, prisma } from "@/lib/auth";
import { formatNaira } from "@/lib/money";
import { UserNav } from "@/components/user-nav";

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
  await requireRole(["admin"]);

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
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <UserNav />
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">Platform state at a glance — every card leads to its action page.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/admin/payments"
            className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Payment queue
            </h2>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {pendingCount}
              <span className="ml-1 text-sm font-medium text-gray-500">waiting</span>
            </p>
            {processingCount > 0 && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                {processingCount} processing — stuck rows need investigation
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Manual transfers awaiting confirmation →
            </p>
          </Link>

          <Link
            href="/admin/payouts"
            className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Owed to developers
            </h2>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatNaira(owedTotal)}</p>
            <p className="mt-2 text-xs text-gray-400">
              Across all “owed” payout rows — transfers stay manual →
            </p>
          </Link>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Businesses
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-gray-400">active</dt>
                <dd className="text-xl font-bold text-green-700">{activeCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-gray-400">past due</dt>
                <dd className="text-xl font-bold text-amber-600">{pastDueCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-gray-400">inactive</dt>
                <dd className="text-xl font-bold text-gray-500">{inactiveCount}</dd>
              </div>
            </dl>
          </section>

          <Link
            href="/admin/ops"
            className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Operations
            </h2>
            <p className="mt-2 text-sm font-medium text-gray-900">
              Run the background jobs manually
            </p>
            <p className="mt-1 text-xs text-gray-400">
              usage snapshot · renewals · past-due sweep · payouts →
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
