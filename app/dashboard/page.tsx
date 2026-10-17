import Link from "next/link";
import { AppShell } from "@/components/shell";
import { requireUser, prisma } from "@/lib/auth";
import { tenantSiteUrl } from "@/lib/site-urls";
import { subscriptionBadge, formatDate } from "@/lib/subscription";
import { formatNaira } from "@/lib/money";
import LogoUpload from "./logo-upload";
import { ProfileForm } from "./profile-form";
import { parseOpeningHours, WEEKDAYS } from "@/lib/opening-hours";
import { DomainPanel } from "@/components/domain-panel";
import { UsageSummary, type UsageRecordView } from "@/components/usage-summary";
import { SUBSCRIPTION_PERIOD_MS } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * Business owner dashboard (Phase 1): subscription status, live site link,
 * profile editing, logo upload. The business is looked up from the SESSION
 * user (one business per account in Phase 1) — no client-supplied ids.
 */
export default async function DashboardPage() {
  const user = await requireUser();

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
      whatsappNumber: true,
      instagramUrl: true,
      facebookUrl: true,
      tiktokUrl: true,
      mapsUrl: true,
      openingHours: true,
      logoUrl: true,
      subscriptionStatus: true,
      nextBillingDate: true,
      paystackSubscriptionCode: true,
      customDomain: true,
      domainStatus: true,
      domainError: true,
      domainCheckedAt: true,
      theme: { select: { name: true } },
    },
  });

  if (!business) {
    return (
      <AppShell section="dashboard">
        <div className="py-16 text-center">
        <h1 className="text-3xl font-bold text-ink">Welcome, {user.email}</h1>
        <p className="mt-3 max-w-sm text-ink-muted">
          You don&apos;t have a business site yet. Pick a subdomain, describe
          your business, and go live in a couple of minutes.
        </p>
        <Link
          href="/onboard"
          className="mt-8 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white hover:bg-ink/80"
        >
          Create your business site →
        </Link>
        </div>
      </AppShell>
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

  // Current-period usage snapshot, if one exists (written daily by the
  // usage-snapshot cron; may also be a hand-seeded test row). Same
  // window logic as the renewal cron so the owner sees the exact numbers
  // the bill will be built from; businesses without a billing date (never
  // activated) fall back to their most recent record.
  let usageRecord: UsageRecordView | null = null;
  const usageSelect = {
    periodStart: true,
    periodEnd: true,
    bandwidthGb: true,
    blobStorageGb: true,
    blobTransferGb: true,
    overageKobo: true,
    sources: true,
  } as const;
  if (business.nextBillingDate) {
    const nb = new Date(business.nextBillingDate).getTime();
    usageRecord = (await prisma.usageRecord.findFirst({
      where: {
        businessId: business.id,
        periodStart: {
          gte: new Date(nb - SUBSCRIPTION_PERIOD_MS - 12 * 60 * 60 * 1000),
          lte: new Date(nb - SUBSCRIPTION_PERIOD_MS + 12 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
      select: usageSelect,
    })) as UsageRecordView | null;
  }
  if (!usageRecord) {
    usageRecord = (await prisma.usageRecord.findFirst({
      where: { businessId: business.id },
      orderBy: { periodStart: "desc" },
      select: usageSelect,
    })) as UsageRecordView | null;
  }

  // Phase 2.5 content counts for the site-content nav (cheap, indexed).
  const [nProducts, nServices, nGallery, nTestimonials] = await Promise.all([
    prisma.product.count({ where: { businessId: business.id } }),
    prisma.service.count({ where: { businessId: business.id } }),
    prisma.galleryImage.count({ where: { businessId: business.id } }),
    prisma.testimonial.count({ where: { businessId: business.id } }),
  ]);

  return (
    <AppShell section="dashboard">

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">{business.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
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
          <div className="rounded-md border border-rule bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Your live site
            </h2>
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate text-sm font-medium text-ink underline decoration-gray-300 hover:decoration-gray-900"
            >
              {siteUrl.replace(/^https?:\/\//, "")}
            </a>
            <Link
              href={`/sites/${business.subdomain}`}
              className="mt-1 block text-xs text-ink-faint underline hover:text-ink-muted"
            >
              Fallback preview (path-based)
            </Link>
          </div>
          <div className="rounded-md border border-rule bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Subscription
            </h2>
            <p className="mt-2 text-sm text-ink">
              {business.subscriptionStatus === "active" &&
                `Renews ${formatDate(business.nextBillingDate)}`}
              {business.subscriptionStatus === "past_due" && "Last payment didn't go through."}
              {business.subscriptionStatus === "inactive" && "No active subscription."}
            </p>
          </div>
        </section>

        {/* Site content nav (Phase 2.5) */}
        <section className="rounded-md border border-rule bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Site content
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <ContentCard href="/dashboard/products" label="Products" count={nProducts} />
            <ContentCard href="/dashboard/services" label="Services" count={nServices} />
            <ContentCard href="/dashboard/gallery" label="Gallery" count={nGallery} />
            <ContentCard href="/dashboard/testimonials" label="Testimonials" count={nTestimonials} />
            <ContentCard href="/dashboard/design" label="Design" count={null} />
          </div>
        </section>

        {pendingPayment && (
          <section className="rounded-md border border-sky-200 bg-sky-50 p-4">
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
          <section className="rounded-md border border-warn/40 bg-warn/10 p-4">
            <p className="text-sm text-warn">
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
              <p className="mt-2 text-xs text-warn">
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
            whatsappNumber: business.whatsappNumber ?? "",
            instagramUrl: business.instagramUrl ?? "",
            facebookUrl: business.facebookUrl ?? "",
            tiktokUrl: business.tiktokUrl ?? "",
            mapsUrl: business.mapsUrl ?? "",
            hours: hoursFormValue(business.openingHours),
          }}
        />

        <LogoUpload currentLogoUrl={business.logoUrl} />

        <UsageSummary record={usageRecord} />

        <DomainPanel
          domain={business.customDomain}
          status={business.domainStatus}
          error={business.domainError}
          checkedAt={business.domainCheckedAt}
        />
      </AppShell>
  );
}

function ContentCard({ href, label, count }: { href: string; label: string; count: number | null }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-rule px-3 py-2.5 text-sm font-medium text-ink hover:border-gray-400 hover:bg-paper"
    >
      {label}
      {count !== null && <span className="ml-1.5 text-xs text-ink-faint">{count}</span>}
    </Link>
  );
}

/** stored hours (any shape) → the form's per-day rows; missing days open-but-empty */
function hoursFormValue(raw: unknown): Record<string, { closed: boolean; open: string; close: string }> {
  const parsed = parseOpeningHours(raw);
  const out: Record<string, { closed: boolean; open: string; close: string }> = {};
  for (const day of WEEKDAYS) {
    const d = parsed?.[day];
    out[day] = !d || d.closed ? { closed: true, open: "", close: "" } : { closed: false, open: d.open, close: d.close };
  }
  return out;
}
