import Link from "next/link";
import { getMarketingState } from "@/lib/marketing";
import { env } from "@/lib/env";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { DEV_SHARE } from "@/lib/billing/payouts";
import { formatNaira } from "@/lib/money";
import { MarketingPage } from "@/components/marketing-chrome";

export const dynamic = "force-dynamic";

/**
 * The flow, step by step — every line describes what the product does today.
 * The payment step renders differently per provider because the PROVIDER
 * SWITCH IS THE TRUTH of this deployment (env.PAYMENT_PROVIDER), not a claim.
 */
const PAYMENT_STEP =
  env.PAYMENT_PROVIDER === "paystack"
    ? {
        head: "Pay by card",
        body: "Checkout opens on Paystack (the bank-grade Nigerian processor). Your subscription renews automatically each month.",
      }
    : {
        head: "Pay by bank transfer",
        body: `We show you the account details; you transfer the month (${formatNaira(HOSTING_FEE_KOBO)} hosting + your template's price) and upload the proof. A human on the Agora team confirms it, and your site goes live.`,
      };

export default async function HowItWorksPage() {
  const state = await getMarketingState();
  const devPct = Math.round(DEV_SHARE * 100);

  return (
    <MarketingPage state={state}>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">How it works</h1>

        <h2 className="mt-10 font-display text-xl font-bold">Getting your business online</h2>
        <ol className="mt-4 space-y-6">
          {[
            ["Create an account", "Email and a password. That's the whole signup — you become a customer and a developer-capable account at once; only one of them is used here."],
            ["Pick a template and preview it for real", "Every preview on Agora is the actual engine rendering the actual package with demo content — full store and empty store both. What you tap in the preview is what your customers will tap."],
            ["Fill in the onboarding wizard", "Business name, logo, hours, what you sell, and your WhatsApp number. It checks your subdomain is free as you type, and shows your own words rendered live in the template before you pay a kobo."],
            [PAYMENT_STEP.head, PAYMENT_STEP.body],
            ["Live — and yours to keep", "Your site serves on its own address with SSL. Add a custom domain from the dashboard whenever you own one. If you ever switch templates, your content comes with you — it lives beside the template, not inside it."],
          ].map(([h, b], i) => (
            <li key={h} className="flex gap-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brass/60 text-sm font-bold text-brass-dark">{i + 1}</span>
              <div>
                <h3 className="text-sm font-bold text-ink">{h}</h3>
                <p className="mt-1 text-sm text-ink-muted">{b}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="mt-12 font-display text-xl font-bold">Publishing a template</h2>
        <ol className="mt-4 space-y-6">
          {[
            ["Turn on developer access", "One switch on your Account page. No application, no approval wait — the developer console opens immediately."],
            ["Build the package anywhere", "A theme is a zip: Liquid templates, CSS, images, a manifest and demo fixtures. The format is fully specified (docs/TEMPLATE_SPEC.md in the repository) — you or your AI agent can write it in any editor."],
            ["Validate it locally", "npm run theme:validate runs the same engine validator the platform uses: security rules (no scripts, no remote CSS, no filesystem), empty-data rendering, size budgets. A package that crashes on an empty shop never ships."],
            ["Publish, then review", "npm run theme:publish uploads an immutable, checksummed version and it lands in review. Agora lists it after a human looks at it — you flip nothing yourself; every version is frozen once published, so customers can't be silently redesignated."],
            ["Get paid monthly", `You set the price and keep ${devPct}% of every subscribed business's payment. The ledger computes the month on the 1st and payouts go out by transfer from there. Agora keeps ${100 - devPct}% plus hosting — that's the whole split.`],
          ].map(([h, b], i) => (
            <li key={h} className="flex gap-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brass/60 text-sm font-bold text-brass-dark">{i + 1}</span>
              <div>
                <h3 className="text-sm font-bold text-ink">{h}</h3>
                <p className="mt-1 text-sm text-ink-muted">{b}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href={state.destination} className="min-h-11 inline-flex items-center rounded-md bg-brass px-5 text-sm font-semibold text-white hover:bg-brass-dark">
            {state.signedIn ? state.ctaLabel : "Start now"}
          </Link>
          <Link href="/pricing" className="min-h-11 inline-flex items-center rounded-md border border-rule-strong px-5 text-sm font-medium hover:bg-ink/5">
            See pricing
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
