import { requireRole, prisma } from "@/lib/auth";
import { formatNaira } from "@/lib/money";
import { formatDate } from "@/lib/subscription";
import { payoutPeriodLabel } from "@/lib/billing/payouts";
import { UserNav } from "@/components/user-nav";
import { MarkPaidButton } from "./payout-actions";

export const dynamic = "force-dynamic";

/**
 * /admin/payouts — the developer payout ledger, admin view (Phase 2).
 *
 * Amounts are COMPUTED (the dev-payouts cron / re-run does the math from
 * confirmed payments); this page only records the manual transfer you made
 * outside the platform. Same trust model as /admin/payments: check your
 * bank records, click, done. "Mark as Paid" is a POST to a role+origin
 * gated API; rows go owed → paid and never return (the cron will not
 * rewrite a paid row, and no UI exists to un-pay — mistakes are DBA work
 * by design, matching the reject-then-new-row philosophy of payments).
 */
export default async function AdminPayoutsPage() {
  await requireRole(["admin"]);

  interface PayoutRow {
    id: string;
    amountKobo: number;
    status: string;
    paidAt: Date | null;
    periodStart: Date;
    periodEnd: Date;
    dev: { email: string | null };
    paidBy: { email: string | null } | null;
  }
  const payoutsRaw = await prisma.devPayout.findMany({
    orderBy: [{ status: "asc" }, { periodStart: "desc" }],
    take: 200,
    select: {
      id: true,
      amountKobo: true,
      status: true,
      paidAt: true,
      periodStart: true,
      periodEnd: true,
      dev: { select: { email: true } }, // explicit select — never User.* (H-1)
      paidBy: { select: { email: true } },
    },
  });

  const payouts = payoutsRaw as PayoutRow[];

  const owedTotal = payouts
    .filter((x) => x.status === "owed")
    .reduce((s, x) => s + x.amountKobo, 0);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <UserNav />
        <h1 className="text-2xl font-bold text-gray-900">Developer payouts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Computed from confirmed payments (70% of each dev&apos;s theme
          price; hosting fee and overage stay platform). Transfer by bank
          yourself, then record it here.{" "}
          <span className="font-medium text-gray-700">
            {formatNaira(owedTotal)}
          </span>{" "}
          currently owed across all devs.
        </p>

        {payouts.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">
              No payout rows yet. The ledger fills when the monthly
              dev-payouts cron runs (06:00 UTC on the 1st) or when you call
              that endpoint by hand.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Developer</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {payoutPeriodLabel(new Date(x.periodStart))}
                      <span className="block font-mono text-xs text-gray-400">
                        {formatDate(new Date(x.periodStart))} → {formatDate(new Date(x.periodEnd))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{x.dev.email}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatNaira(x.amountKobo)}
                    </td>
                    <td className="px-4 py-3">
                      {x.status === "paid" ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          paid {x.paidAt ? formatDate(new Date(x.paidAt)) : ""}
                          {x.paidBy?.email ? ` · by ${x.paidBy.email}` : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          owed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {x.status === "owed" ? (
                        <MarkPaidButton id={x.id} />
                      ) : (
                        <span className="block text-right text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
