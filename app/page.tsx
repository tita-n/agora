import Link from "next/link";
import { getMarketingState } from "@/lib/marketing";
import { prisma } from "@/lib/prisma";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { DEV_SHARE } from "@/lib/billing/payouts";
import { formatNaira } from "@/lib/money";
import { MarketingPage } from "@/components/marketing-chrome";

export const dynamic = "force-dynamic";

/**
 * Public marketing home (Phase 0). Session-aware CTA (this read is why the
 * page is force-dynamic — a cached CTA would greet the wrong person).
 * Copy rule: every number comes from the same config the billing code uses
 * (HOSTING_FEE_KOBO, DEV_SHARE) and every claim describes behavior that
 * exists TODAY. No domain name, contact method or promise is invented here.
 * Controls are inventoried in docs/HOMEPAGE-ACTIONS.md; e2e/homepage.spec.ts
 * fails if this page grows a control that isn't wired and listed.
 */
export default async function HomePage() {
  const state = await getMarketingState();
  const { destination, ctaLabel, devCta } = state;

  const themes = (await prisma.theme.findMany({
    where: { status: "published" },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
    take: 12,
    select: { slug: true, name: true, price: true, description: true, categories: true },
  })) as { slug: string; name: string; price: number; description: string | null; categories: string[] }[];
  const minThemePrice = themes.length ? themes[0].price : null;
  const devPct = Math.round(DEV_SHARE * 100);

  return (
    <MarketingPage state={state}>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-14 sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-dark">
          Websites for small businesses — and a market for the people who build them
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.1] sm:text-5xl">
          Your business online this week. No build fee.
        </h1>
        <p className="mt-4 max-w-xl text-base text-ink-muted sm:text-lg">
          Pick a template, preview the real thing with your own words and
          photos, and go live on an address of your own. Every page has a
          WhatsApp button that actually works — customers tap, you answer, no
          apps to install.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href={destination} className="min-h-11 inline-flex items-center rounded-md bg-brass px-6 text-sm font-semibold text-white hover:bg-brass-dark">
            {ctaLabel}
          </Link>
          {themes[0] && (
            <Link href={`/t/${themes[0].slug}`} className="min-h-11 inline-flex items-center rounded-md border border-rule-strong px-5 text-sm font-medium text-ink hover:bg-ink/5">
              See a real demo →
            </Link>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          {minThemePrice !== null
            ? `From ${formatNaira(minThemePrice)}/month for a template + ${formatNaira(HOSTING_FEE_KOBO)}/month hosting. Month to month, no contracts.`
            : `Hosting ${formatNaira(HOSTING_FEE_KOBO)}/month, month to month.`}
        </p>
      </section>

      {/* How it works — two tracks */}
      <section className="border-y border-rule bg-card" id="how-it-works">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold">For businesses</h2>
            <ol className="mt-4 space-y-3 text-sm text-ink-muted">
              {[
                ["Pick", "Browse templates that already look like real shops, salons and kitchens — previews are live pages, not screenshots."],
                ["Make it yours", "Name, logo, hours, gallery, services or a full product catalogue. Orders and enquiries arrive on your WhatsApp."],
                ["Pay monthly", `${formatNaira(HOSTING_FEE_KOBO)} hosting plus the template's monthly price. No agency quotes, no build fee.`],
                ["Go live", "A working site on day one, on its own address; connect your own domain whenever you're ready."],
              ].map(([h, b], i) => (
                <li key={h} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/50 text-xs font-bold text-brass-dark">{i + 1}</span>
                  <span><b className="text-ink">{h}.</b> {b}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">For developers</h2>
            <ol className="mt-4 space-y-3 text-sm text-ink-muted">
              {[
                ["Build a template", "A sandboxed package — markup, CSS, images — in the format of our template spec. You (or your AI agent) write it anywhere."],
                ["Validate & publish", "The platform runs the validator: security rules, empty-data rendering, size budgets. Pass it, and Agora lists your template after review."],
                ["Price it yourself", `You set the monthly price. You keep ${devPct}%; the ledger computes payouts on the 1st of each month — no invoicing, no chasing.`],
                ["Earn monthly", "Every subscribed business pays you every month. Plugins attach to ANY template through platform slots — your work is never template-locked."],
              ].map(([h, b], i) => (
                <li key={h} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/50 text-xs font-bold text-brass-dark">{i + 1}</span>
                  <span><b className="text-ink">{h}.</b> {b}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              <Link href={devCta.href} className="min-h-11 inline-flex items-center rounded-md border border-brass/60 px-4 text-sm font-semibold text-brass-dark hover:bg-brass-faint">
                {devCta.label} →
              </Link>
              {!state.signedIn && (
                <p className="mt-2 text-xs text-ink-faint">
                  Sign up first — developer access is one switch on your Account page, instantly, no approval needed.
                </p>
              )}
              {state.signedIn && !state.caps.isDeveloper && (
                <p className="mt-2 text-xs text-ink-faint">
                  Turn on developer access on your Account page — instantly, no approval needed.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Templates strip (real DB rows — nothing fabricated) */}
      {themes.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-14" id="templates">
          <h2 className="font-display text-2xl font-bold">Live on Agora today</h2>
          <p className="mt-1 text-sm text-ink-muted">Every card opens a working site with demo content — tap the buttons, it’s real.</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {themes.map((t) => (
              <li key={t.slug} className="rounded-md border border-rule bg-card p-4">
                <h3 className="text-sm font-semibold">{t.name}</h3>
                <p className="mt-1 min-h-10 text-xs text-ink-muted">{t.description ?? t.categories.join(", ")}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="tabular font-semibold text-ink">{formatNaira(t.price)}<span className="font-normal text-ink-faint">/mo</span></span>
                  <Link href={`/t/${t.slug}`} className="min-h-11 inline-flex items-center rounded px-2 font-medium text-brass-dark underline underline-offset-2 hover:bg-brass-faint">
                    Preview
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pricing */}
      <section className="border-t border-rule bg-card" id="pricing">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-display text-2xl font-bold">Plain pricing</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-rule bg-paper p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Hosting</h3>
              <p className="mt-2 font-display text-3xl font-bold tabular">{formatNaira(HOSTING_FEE_KOBO)}<span className="text-base font-medium text-ink-faint">/month</span></p>
              <p className="mt-2 text-sm text-ink-muted">Your site, SSL, its own address, WhatsApp links, and a phone that fits it. Heavy traffic costs a flat per-GB overage, never a surprise plan jump.</p>
            </div>
            <div className="rounded-md border border-rule bg-paper p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Template</h3>
              <p className="mt-2 font-display text-3xl font-bold tabular">
                {minThemePrice !== null ? formatNaira(minThemePrice) : "—"}
                <span className="text-base font-medium text-ink-faint">+/month</span>
              </p>
              <p className="mt-2 text-sm text-ink-muted">Each template sets its own monthly price, chosen by its developer. Swap templates anytime — your content lives beside the template, not inside it.</p>
            </div>
            <div className="rounded-md border border-rule bg-paper p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">For developers</h3>
              <p className="mt-2 font-display text-3xl font-bold tabular">{devPct}<span className="text-base font-medium text-ink-faint">%</span></p>
              <p className="mt-2 text-sm text-ink-muted">of your template price, every month. The ledger computes payouts on the 1st and Agora transfers them out — Agora keeps {100 - devPct}% plus hosting. <Link href="/pricing" className="text-brass-dark underline underline-offset-2">Full pricing details →</Link></p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
