import Link from "next/link";
import { getMarketingState } from "@/lib/marketing";
import { prisma } from "@/lib/prisma";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { DEV_SHARE } from "@/lib/billing/payouts";
import { FUP_LIMITS, OVERAGE_RATES_KOBO_PER_GB } from "@/lib/billing/overage";
import { formatNaira } from "@/lib/money";
import { MarketingPage } from "@/components/marketing-chrome";

export const dynamic = "force-dynamic";

/**
 * Pricing is GENERATED from the same constants the billing code charges
 * against — HOSTING_FEE_KOBO, FUP_LIMITS/OVERAGE_RATES_KOBO_PER_GB,
 * DEV_SHARE and each Template's DB price. Nothing is typed in here; if a
 * number is wrong on this page, billing itself is wrong, and this page can
 * never disagree with an invoice.
 */
const nairaPerGb = (kobos: number) => `${formatNaira(kobos)}/GB`;

export default async function PricingPage() {
  const state = await getMarketingState();
  const themes = (await prisma.theme.findMany({
    where: { status: "published" },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
    select: { slug: true, name: true, price: true },
  })) as { slug: string; name: string; price: number }[];
  const devPct = Math.round(DEV_SHARE * 100);

  return (
    <MarketingPage state={state}>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Pricing, in full</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Two lines a month and a flat rate for heavy traffic. No setup fee, no
          contracts, no plan you have to “upgrade” out of.
        </p>

        <div className="mt-8 overflow-hidden rounded-md border border-rule">
          <table className="w-full text-sm">
            <caption className="sr-only">What you pay for</caption>
            <tbody>
              {[
                ["Hosting", `${formatNaira(HOSTING_FEE_KOBO)}/month`, "Storage, SSL, serving, backups of the runtime — one flat fee, any template."],
                ["Template", themes.length ? `${formatNaira(themes[0].price)}–${formatNaira(themes[themes.length - 1].price)}/month` : "set by each developer", "The developer prices their work; you pay it monthly for as long as you use the template."],
                ["Bandwidth", `${FUP_LIMITS.includedBandwidthGb} GB included, then ${nairaPerGb(OVERAGE_RATES_KOBO_PER_GB.bandwidth)}`, "Metered monthly against your real page traffic. Flat rate, charged next cycle — never a forced plan change."],
                ["File storage", `${(FUP_LIMITS.includedBlobStorageGb * 1000).toLocaleString("en-NG", { maximumFractionDigits: 0 })} MB included, then ${nairaPerGb(OVERAGE_RATES_KOBO_PER_GB.blobStorage)}/month`, "Your logo and gallery images. Most shops sit far under the included amount."],
                ["File delivery", `${FUP_LIMITS.includedBlobTransferGb} GB/month included, then ${nairaPerGb(OVERAGE_RATES_KOBO_PER_GB.blobTransfer)}`, "What visitors spend pulling your images down — assets are cached hard, so this grows slowly."],
              ].map(([k, v, note], i) => (
                <tr key={k} className={i % 2 ? "bg-card" : "bg-paper"}>
                  <th scope="row" className="w-36 border-t border-rule px-4 py-3 text-left align-top font-semibold text-ink">{k}</th>
                  <td className="border-t border-l border-rule px-4 py-3 align-top">
                    <span className="tabular font-semibold text-ink">{v}</span>
                    <p className="mt-1 text-xs text-ink-muted">{note}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 font-display text-xl font-bold">If you publish templates</h2>
        <p className="mt-2 text-sm text-ink-muted">
          You set your price; you keep <b className="tabular text-ink">{devPct}%</b> of it from every
          subscribed business, every month. On the 1st, the platform ledger
          computes each developer’s month from confirmed payments and issues a
          payout row; Agora transfers it out after that. Agora keeps{" "}
          <b className="tabular text-ink">{100 - devPct}%</b> plus the hosting fee — the whole deal, in
          one place.
        </p>

        {themes.length > 0 && (
          <>
            <h2 className="mt-10 font-display text-xl font-bold">Templates on the market now</h2>
            <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-md border border-rule text-sm">
              {themes.map((t) => (
                <li key={t.slug} className="flex items-center justify-between gap-4 bg-paper px-4 py-2.5">
                  <span className="font-medium text-ink">{t.name}</span>
                  <span className="flex items-center gap-4">
                    <span className="tabular text-ink-muted">{formatNaira(t.price)}/mo</span>
                    <Link href={`/t/${t.slug}`} className="min-h-11 inline-flex items-center rounded px-1 font-medium text-brass-dark underline underline-offset-2 hover:bg-brass-faint">
                      Preview
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={state.destination} className="min-h-11 inline-flex items-center rounded-md bg-brass px-5 text-sm font-semibold text-white hover:bg-brass-dark">
            {state.ctaLabel}
          </Link>
          <Link href="/faq" className="min-h-11 inline-flex items-center rounded-md border border-rule-strong px-5 text-sm font-medium hover:bg-ink/5">
            Questions? Read the FAQ
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
