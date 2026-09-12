import Link from "next/link";
import { requireRole, prisma } from "@/lib/auth";
import { tenantSiteUrl } from "@/lib/site-urls";
import { subscriptionBadge, formatDate } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * Developer portal (Phase 1): read-only visibility into who subscribes to
 * your theme. Deliberately no payout automation yet — devs see their
 * numbers; the 70% transfer is manual until Phase 2.
 *
 * One query, nested select (audit guidance: no N+1, never `include` on
 * User relations).
 */
/** Shape of the nested query below (also documents what the table renders). */
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
    },
  });

  const themes: DevThemeRow[] = (dev?.themes ?? []) as DevThemeRow[];
  const subscribers = themes.reduce((n, t) => n + t.businesses.length, 0);
  const active = themes.reduce(
    (n, t) => n + t.businesses.filter((b) => b.subscriptionStatus === "active").length,
    0
  );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
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

        <p className="mt-8 text-xs text-gray-400">
          Payouts (your 70% share) are transferred manually during Phase 1 —
          automation arrives with the payment provider work.
        </p>
        <div className="mt-4">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-900">
            ← Back to Agora
          </Link>
        </div>
      </div>
    </main>
  );
}
