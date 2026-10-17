import { requireRole, prisma } from "@/lib/auth";
import { tenantSiteUrl } from "@/lib/site-urls";
import { subscriptionBadge, formatDate } from "@/lib/subscription";
import { UserNav } from "@/components/user-nav";
import { formatNaira } from "@/lib/money";
import { payoutPeriodLabel } from "@/lib/billing/payouts";

export const dynamic = "force-dynamic";

/**
 * Developer portal. Phase 1: read-only visibility into who subscribes to
 * your theme. Phase 2: the payout LEDGER is automated (the monthly cron
 * computes 70% of your theme price across confirmed payments, per calendar
 * month) — the money transfer itself stays manual, and the number shown
 * here is the auditable record of it.
 *
 * One query, nested select (audit guidance: no N+1, never `include` on
 * User relations).
 */
/** Shape of the nested query below (also documents what the table renders). */
type DevPayoutRow = {
  id: string;
  amountKobo: number;
  status: string;
  paidAt: Date | null;
  periodStart: Date;
};
type DevThemeRow = {
  id: string;
  name: string;
  price: number;
  businesses: Array<{
    name: string;
    subdomain: string;
    subscriptionStatus: string;
    nextBillingDate: Date | null;
  }>;
};

export default async function DevPage() {
  const user = await requireRole(["developer", "admin"]);

  const dev = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      themes: {
        select: {
          id: true,
          name: true,
          price: true,
          businesses: {
            select: {
              name: true,
              subdomain: true,
              subscriptionStatus: true,
              nextBillingDate: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      devPayouts: {
        orderBy: { periodStart: "desc" },
        take: 24,
        select: { id: true, amountKobo: true, status: true, paidAt: true, periodStart: true },
      },
    },
  });

  const themes: DevThemeRow[] = (dev?.themes ?? []) as DevThemeRow[];
  const payouts: DevPayoutRow[] = ((dev as { devPayouts?: DevPayoutRow[] } | null)?.devPayouts ?? []) as DevPayoutRow[];
  const owedTotal = payouts.filter((x) => x.status === "owed").reduce((s, x) => s + x.amountKobo, 0);
  const subscribers = themes.reduce((n, t) => n + t.businesses.length, 0);
  const active = themes.reduce(
    (n, t) => n + t.businesses.filter((b) => b.subscriptionStatus === "active").length,
    0
  );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <UserNav />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Developer portal</h1>
            <p className="mt-1 text-sm text-gray-500">
              Signed in as {user.email}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{subscribers}</span>{" "}
            subscribed ·{" "}
            <span className="font-semibold text-green-700">{active}</span> active
          </div>
        </header>

        {themes.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              You haven&apos;t published any themes yet. Theme creation is
              part of the developer tools coming next.
            </p>
          </div>
        ) : (
          themes.map((theme) => (
            <section
              key={theme.id}
              className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="flex items-baseline justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  “{theme.name}” — ₦{(theme.price / 100).toLocaleString("en-NG")}/mo
                </h2>
                <span className="text-xs text-gray-400">
                  {theme.businesses.length} business
                  {theme.businesses.length === 1 ? "" : "es"}
                </span>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-2 font-medium">Business</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Next billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {theme.businesses.map((b) => {
                    const badge = subscriptionBadge(b.subscriptionStatus);
                    return (
                      <tr key={b.subdomain}>
                        <td className="px-5 py-3">
                          <a
                            href={tenantSiteUrl(b.subdomain)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-gray-900 hover:underline"
                          >
                            {b.name}
                          </a>
                          <span className="block text-xs text-gray-400">
                            {tenantSiteUrl(b.subdomain).replace(/^https?:\/\//, "")}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {formatDate(b.nextBillingDate)}
                        </td>
                      </tr>
                    );
                  })}
                  {theme.businesses.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-6 text-center text-gray-400">
                        No subscribers yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          ))
        )}

        <section className="mt-10 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex items-baseline justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Payouts — your 70% share</h2>
            <span className="text-sm text-gray-500">
              owed now: <span className="font-semibold text-gray-900">{formatNaira(owedTotal)}</span>
            </span>
          </div>
          {payouts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">
              No payouts computed yet. A row appears after the first full
              month following your first confirmed payment (computed on the
              1st, covering the previous month).
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2 font-medium">Period</th>
                  <th className="px-5 py-2 font-medium">Amount</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map((x) => (
                  <tr key={x.id}>
                    <td className="px-5 py-3 text-gray-900">{payoutPeriodLabel(new Date(x.periodStart))}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{formatNaira(x.amountKobo)}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {x.status === "paid"
                        ? `paid ${x.paidAt ? formatDate(new Date(x.paidAt)) : ""}`
                        : "owed — transfer arrives manually from Agora"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
