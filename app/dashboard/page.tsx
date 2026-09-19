import Link from "next/link";
import { requireRole, prisma } from "@/lib/auth";
import { tenantSiteUrl } from "@/lib/site-urls";
import { subscriptionBadge, formatDate } from "@/lib/subscription";
import { formatNaira } from "@/lib/money";
import LogoUpload from "./logo-upload";
import { UserNav } from "@/components/user-nav";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

/**
 * Business owner dashboard (Phase 1): subscription status, live site link,
 * profile editing, logo upload. The business is looked up from the SESSION
 * user (one business per account in Phase 1) — no client-supplied ids.
 */
export default async function DashboardPage() {
  const user = await requireRole(["business_owner", "admin"]);

  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      subdomain: true,
      description: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      primaryColor: true,
      logoUrl: true,
      subscriptionStatus: true,
      nextBillingDate: true,
      paystackSubscriptionCode: true,
      theme: { select: { name: true } },
    },
  });

  if (!business) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="w-full max-w-sm">
          <UserNav />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome, {user.email}</h1>
        <p className="mt-3 max-w-sm text-gray-500">
          You don&apos;t have a business site yet. Pick a subdomain, describe
          your business, and go live in a couple of minutes.
        </p>
        <Link
          href="/onboard"
          className="mt-8 rounded-md bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Create your business site →
        </Link>
      </main>
    );
  }

  const badge = subscriptionBadge(business.subscriptionStatus);
  const siteUrl = tenantSiteUrl(business.subdomain);

  // Manual-provider queue: tell the owner exactly what they're waiting on.
  const pendingPayment = await prisma.pendingPayment.findFirst({
    where: { userId: user.id, status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "desc" },
    select: { reference: true, amountKobo: true, kind: true },
  });

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <UserNav />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {business.theme ? `Theme: ${business.theme.name}` : "Theme: —"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${badge.classes}`}
          >
            {badge.label}
          </span>
        </header>

        {/* Site + billing summary */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Your live site
            </h2>
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate text-sm font-medium text-gray-900 underline decoration-gray-300 hover:decoration-gray-900"
            >
              {siteUrl.replace(/^https?:\/\//, "")}
            </a>
            <Link
              href={`/sites/${business.subdomain}`}
              className="mt-1 block text-xs text-gray-400 underline hover:text-gray-600"
            >
              Fallback preview (path-based)
            </Link>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Subscription
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              {business.subscriptionStatus === "active" &&
                `Renews ${formatDate(business.nextBillingDate)}`}
              {business.subscriptionStatus === "past_due" && "Last payment didn't go through."}
              {business.subscriptionStatus === "inactive" && "No active subscription."}
            </p>
          </div>
        </section>

        {pendingPayment && (
          <section className="rounded-lg border border-sky-200 bg-sky-50 p-4">
            <p className="text-sm text-sky-900">
              {pendingPayment.kind === "renewal"
                ? "Your renewal payment is awaiting confirmation — "
                : "Your payment is awaiting confirmation — "}
              reference{" "}
              <span className="font-mono font-semibold">{pendingPayment.reference}</span>{" "}
              for {formatNaira(pendingPayment.amountKobo)}. We check transfers
              every business day; everything here updates automatically once
              it&apos;s confirmed.
            </p>
          </section>
        )}

        {/* Past-due: calm, actionable, no red-alert language */}
        {business.subscriptionStatus === "past_due" && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              We couldn&apos;t collect this month&apos;s payment, so your site
              is <span className="font-semibold">still live</span> — no action
              is needed today. To keep everything running smoothly, update your
              payment details when it suits you.
            </p>
            {business.paystackSubscriptionCode ? (
              <a
                href="/api/business/billing-portal"
                className="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Update payment details
              </a>
            ) : (
              <p className="mt-2 text-xs text-amber-700">
                If the problem continues, contact support@agora.test.
              </p>
            )}
          </section>
        )}

        <ProfileForm
          initial={{
            name: business.name,
            description: business.description ?? "",
            contactEmail: business.contactEmail ?? "",
            contactPhone: business.contactPhone ?? "",
            address: business.address ?? "",
            primaryColor: business.primaryColor ?? "",
          }}
        />

        <LogoUpload currentLogoUrl={business.logoUrl} />

      </div>
    </main>
  );
}
