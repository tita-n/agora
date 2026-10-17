import Link from "next/link";
import { getCurrentUser, userCapabilities } from "@/lib/auth";
import { postLoginPath } from "@/lib/routing";
import { prisma } from "@/lib/prisma";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { formatNaira } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Public marketing home (Phase 0). Session-aware CTA (this read is why the
 * page is force-dynamic — a cached CTA would greet the wrong person).
 * Content is what the product IS today: no vaporware promises — the
 * developer pitch describes the authoring + 70% split that actually exist.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  const caps = user ? await userCapabilities(user.id) : null;
  const destination = user ? postLoginPath(caps ?? { isStaff: false, hasBusiness: false, isDeveloper: false }) : "/signup";
  const ctaLabel = !user
    ? "Create your site"
    : caps?.isStaff
      ? "Admin dashboard"
      : caps?.hasBusiness
        ? "Go to dashboard"
        : caps?.isDeveloper
          ? "Developer console"
          : "Start onboarding";

  const themes = (await prisma.theme.findMany({
    where: { status: "published" },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
    take: 12,
    select: { slug: true, name: true, price: true, description: true, categories: true },
  })) as { slug: string; name: string; price: number; description: string | null; categories: string[] }[];
  const minThemePrice = themes.length ? themes[0].price : null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between px-4">
          <span className="font-display text-xl font-bold tracking-tight">
            Agora<span className="text-brass">.</span>
          </span>
          <nav aria-label="Main" className="flex items-center gap-2 text-sm">
            {user ? (
              <Link href={destination} className="min-h-11 rounded-md bg-brass px-4 font-semibold text-white hover:bg-brass-dark">
                {ctaLabel}
              </Link>
            ) : (
              <>
                <Link href="/login" className="min-h-11 flex items-center rounded-md px-3 font-medium text-ink-muted hover:text-ink">
                  Sign in
                </Link>
                <Link href="/signup" className="min-h-11 flex items-center rounded-md bg-brass px-4 font-semibold text-white hover:bg-brass-dark">
                  Create your site
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
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
            photos, and go live on your own address for a small monthly
            subscription. Every page has a WhatsApp button that actually works —
            customers tap, you answer, no apps to install.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={user ? destination : "/signup"} className="min-h-11 rounded-md bg-brass px-6 py-2.5 text-sm font-semibold text-white hover:bg-brass-dark">
              {ctaLabel}
            </Link>
            {themes[0] && (
              <a href={`/t/${themes[0].slug}`} className="min-h-11 rounded-md border border-rule-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5">
                See a real demo →
              </a>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            {minThemePrice !== null
              ? `From ${formatNaira(minThemePrice)}/month for a template + ${formatNaira(HOSTING_FEE_KOBO)}/month hosting. Cancel anytime; your content is yours.`
              : `Hosting ${formatNaira(HOSTING_FEE_KOBO)}/month.`}
          </p>
        </section>

        {/* How it works — two tracks */}
        <section className="border-y border-rule bg-card">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl font-bold">For businesses</h2>
              <ol className="mt-4 space-y-3 text-sm text-ink-muted">
                {[
                  ["Pick", "Browse templates that already look like real shops, salons and kitchens — previews are live pages, not screenshots."],
                  ["Make it yours", "Name, logo, hours, gallery, services or full product catalogue. Orders and bookings arrive on your WhatsApp."],
                  ["Pay monthly", `${formatNaira(HOSTING_FEE_KOBO)} hosting plus the template's monthly price. No ₦200k build fee, no agency back-and-forth.`],
                  ["Go live", "YourAddress.agorasites.com on day one; connect your own domain when you're ready."],
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
                  ["Build a template", "A sandboxed package — markup, CSS, images — in the format in our template spec. You (or your AI agent) write it anywhere."],
                  ["Validate & publish", "The platform runs the validator: security rules, empty-data rendering, size budgets. Pass, get reviewed, ship to the store."],
                  ["Price it yourself", "You set the monthly price. You keep 70%; payouts run monthly through the ledger — no invoicing, no chasing."],
                  ["Earn while you sleep", "Every subscribed business pays you monthly. Plugins attach to ANY template through platform slots — your work is never template-locked."],
                ].map(([h, b], i) => (
                  <li key={h} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/50 text-xs font-bold text-brass-dark">{i + 1}</span>
                    <span><b className="text-ink">{h}.</b> {b}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Templates strip (real DB rows — nothing fabricated) */}
        {themes.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="font-display text-2xl font-bold">Live on Agora today</h2>
            <p className="mt-1 text-sm text-ink-muted">Every card opens a working site with demo content — tap the buttons, it’s real.</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {themes.map((t) => (
                <li key={t.slug} className="rounded-md border border-rule bg-card p-4">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <p className="mt-1 min-h-10 text-xs text-ink-muted">{t.description ?? t.categories.join(", ")}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="tabular font-semibold text-ink">{formatNaira(t.price)}<span className="font-normal text-ink-faint">/mo</span></span>
                    <a href={`/t/${t.slug}`} className="min-h-9 rounded px-2 py-1 font-medium text-brass-dark underline underline-offset-2 hover:bg-brass-faint">Preview</a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pricing */}
        <section className="border-t border-rule bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="font-display text-2xl font-bold">Plain pricing</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-rule bg-paper p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Hosting</h3>
                <p className="mt-2 font-display text-3xl font-bold tabular">{formatNaira(HOSTING_FEE_KOBO)}<span className="text-base font-medium text-ink-faint">/month</span></p>
                <p className="mt-2 text-sm text-ink-muted">Your site, SSL, subdomain, WhatsApp links, and a phone that fits it. Heavy traffic costs a flat overage, never a surprise plan jump.</p>
              </div>
              <div className="rounded-md border border-rule bg-paper p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Template</h3>
                <p className="mt-2 font-display text-3xl font-bold tabular">
                  {minThemePrice !== null ? formatNaira(minThemePrice) : "—"}
                  <span className="text-base font-medium text-ink-faint">+/month</span>
                </p>
                <p className="mt-2 text-sm text-ink-muted">Each template sets its own monthly price, chosen by its developer. Swap templates anytime; your content moves with you.</p>
              </div>
              <div className="rounded-md border border-rule bg-paper p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">For developers</h3>
                <p className="mt-2 font-display text-3xl font-bold tabular">70<span className="text-base font-medium text-ink-faint">%</span></p>
                <p className="mt-2 text-sm text-ink-muted">Of your template price, every month, paid on the 1st through the platform ledger. Agora keeps 30% plus hosting.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-ink-muted">
          <span>© {new Date().getFullYear()} Agora — built for Nigerian small business.</span>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/signup" className="underline-offset-4 hover:underline">Get a site</Link>
            <Link href="/login" className="underline-offset-4 hover:underline">Sign in</Link>
            <Link href="/account" className="underline-offset-4 hover:underline">Account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
