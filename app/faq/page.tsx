import Link from "next/link";
import { getMarketingState } from "@/lib/marketing";
import { env } from "@/lib/env";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { FUP_LIMITS, OVERAGE_RATES_KOBO_PER_GB } from "@/lib/billing/overage";
import { formatNaira } from "@/lib/money";
import { MarketingPage } from "@/components/marketing-chrome";

export const dynamic = "force-dynamic";

/**
 * Only questions we can answer from shipped behavior. If an answer would
 * require a policy or contact channel that doesn't exist yet (support inbox,
 * refund policy, data export), the question is NOT here — see the removal
 * ledger in docs/HOMEPAGE-ACTIONS.md.
 */
export default async function FaqPage() {
  const state = await getMarketingState();
  const payMethod =
    env.PAYMENT_PROVIDER === "paystack"
      ? "By card on Paystack — checkout, then automatic monthly renewal."
      : `By bank transfer — we show the account, you send ${formatNaira(HOSTING_FEE_KOBO)} plus your template price with the reference, upload the proof, and the platform team confirms it before your site goes live.`;

  const faqs: [string, string][] = [
    ["Are the template previews real sites?", "Yes — the same sandboxed engine that serves paying customers renders the same package version, with demo content in a full state and an empty state. Tap the buttons in a preview; they work, because it IS the site."],
    [`What does it cost to start?`, `${formatNaira(HOSTING_FEE_KOBO)}/month hosting plus your template's monthly price. Nothing before that: signup, previewing and the onboarding wizard are free, and there is no build fee.`],
    ["How do I pay?", payMethod],
    ["Do my customers need to install anything?", "No. Orders, quotes and bookings run through your WhatsApp button — a tap opens WhatsApp (or the store's number prompt) with the message pre-filled. There is no app and no account for your customers."],
    ["Can I use my own domain?", "Yes. Add it on the dashboard; we verify DNS ownership exactly before serving on it, and SSL is automatic once it points at us. Your original Agora address keeps working beside it."],
    ["What if my site gets big traffic?", `The first ${FUP_LIMITS.includedBandwidthGb} GB of monthly bandwidth is included. Past that it's ${formatNaira(OVERAGE_RATES_KOBO_PER_GB.bandwidth)}/GB, billed flat on the next cycle — sites are never cut off mid-month and never forced onto a pricier "plan".`],
    ["Can I switch templates?", "Any time. Your content (products, services, hours, gallery) belongs to your business, not the theme — the new template renders what you already have. You pay the new template's monthly price from the next cycle."],
    ["Is there a contract?", "No. Month to month, cancel whenever it stops being useful — nothing is held hostage and your site simply isn't renewed."],
    ["What happens if a payment is late?", "Nothing automatic and nothing sudden: sites are never auto-suspended for a missed payment. The platform reminds you before renewal and flags the account, and a human talks to you. (Reminder delivery is email in today's setup.) We would rather fix a bank mistake than take down a shop."],
    ["Who can publish templates?", "Anyone with an Agora account — flip developer access on your Account page and the console opens immediately; no application, no waiting. The machine validator, not a gatekeeper, enforces the hard rules: no scripts, no remote CSS, size budgets, and it must render correctly on an empty business."],
    ["Is it fast on a Nigerian phone?", "It's the design rule: themes ship with subset fonts (or none), images through a hard-cache asset route, CSS inlined per page, and the empty-data render is part of validation — a template that bloats fails review."],
  ];

  return (
    <MarketingPage state={state}>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Questions, answered</h1>
        <dl className="mt-8 space-y-8">
          {faqs.map(([q, a]) => (
            <div key={q}>
              <dt className="text-sm font-bold text-ink">{q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-muted">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link href={state.destination} className="min-h-11 inline-flex items-center rounded-md bg-brass px-5 text-sm font-semibold text-white hover:bg-brass-dark">
            {state.ctaLabel}
          </Link>
          <Link href="/how-it-works" className="min-h-11 inline-flex items-center rounded-md border border-rule-strong px-5 text-sm font-medium hover:bg-ink/5">
            Or see how it works, step by step
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
