import { redirect } from "next/navigation";
import { requireUser, prisma, userCapabilities } from "@/lib/auth";
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
 * chosen themeSlug, so the wizard is never trusted for money, ids, or which
 * Theme row gets billed.
 */
export default async function OnboardPage() {
  const user = await requireUser();

  const caps = await userCapabilities(user.id);

  const existing = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (existing) redirect("/dashboard");

  // Phase 0: the picker lists PUBLISHED theme rows from the DB (packages
  // with lifecycle), not a code registry. slug is the only identity the
  // client ever sends; payment-init resolves row + price server-side.
  const themeRows = (await prisma.theme.findMany({
    where: { status: "published" },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
    select: { name: true, price: true, slug: true, description: true },
  })) as { name: string; price: number; slug: string; description: string | null }[];
  if (themeRows.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Onboarding is not open yet</h1>
        <p className="mt-2 text-gray-500">No theme is available to purchase right now.</p>
      </main>
    );
  }

  return (
    <>
      {!caps.emailVerified && (
        <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Confirm your email to finish activation — check your inbox (dev
          servers print the link in the console). Onboarding continues either
          way, but nothing can be charged until then.
        </div>
      )}
      <OnboardWizard
      userId={user.id}
      rootDomain={resolveHosts().sitesDomain.split(":")[0]}
      themes={themeRows.map((t) => ({ name: t.name, priceKobo: t.price, slug: t.slug, description: t.description }))}
      hostingFeeKobo={HOSTING_FEE_KOBO}
    />
    </>
  );
}
