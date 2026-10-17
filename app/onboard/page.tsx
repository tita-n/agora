import { redirect } from "next/navigation";
import { requireRole, prisma } from "@/lib/auth";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { resolveHosts } from "@/lib/env";
import { OnboardWizard } from "./onboard-wizard";

export const dynamic = "force-dynamic";

/**
 * Onboarding (Phase 1 → 2.5): 5 steps — subdomain, profile, theme, live
 * preview, payment. business_owner only (per spec); users who already have a
 * business are sent to their dashboard. Theme NAMES, PRICES and KEYS come
 * from the DB server-side and flow into the wizard as display values —
 * payment amounts are recomputed again server-side at payment-init from the
 * chosen themeKey, so the wizard is never trusted for money, ids, or which
 * Theme row gets billed.
 *
 * A theme row whose templateKey has no renderer still appears for purchase
 * (price is data) but renders as Minimal on the live site — the registry's
 * fallback rule, not a bug to fix here.
 */
export default async function OnboardPage() {
  const user = await requireRole(["business_owner"]);

  const existing = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (existing) redirect("/dashboard");

  const themeRows = (await prisma.theme.findMany({
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
    select: { name: true, price: true, templateKey: true },
  })) as { name: string; price: number; templateKey: string }[];
  if (themeRows.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Onboarding is not open yet</h1>
        <p className="mt-2 text-gray-500">No theme is available to purchase right now.</p>
      </main>
    );
  }

  return (
    <OnboardWizard
      userId={user.id}
      rootDomain={resolveHosts().sitesDomain.split(":")[0]}
      themes={themeRows.map((t) => ({ name: t.name, priceKobo: t.price, templateKey: t.templateKey }))}
      hostingFeeKobo={HOSTING_FEE_KOBO}
    />
  );
}
