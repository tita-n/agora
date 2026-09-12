import { redirect } from "next/navigation";
import { requireRole, prisma } from "@/lib/auth";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";
import { env } from "@/lib/env";
import { OnboardWizard } from "./onboard-wizard";

export const dynamic = "force-dynamic";

/**
 * Onboarding (Phase 1): 4 steps — subdomain, profile, live preview, payment.
 * business_owner only (per spec); users who already have a business are
 * sent to their dashboard. Prices come from the DB server-side and flow
 * into the wizard as display values — payment amounts are recomputed
 * again server-side at payment-init, so this is never trusted input.
 */
export default async function OnboardPage() {
  const user = await requireRole(["business_owner"]);

  const existing = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (existing) redirect("/dashboard");

  const theme = await prisma.theme.findFirst({
    where: { name: "Minimal" },
    select: { id: true, name: true, price: true },
  });
  if (!theme) {
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
      rootDomain={(env.ROOT_DOMAIN || "agora.test").split(":")[0]}
      themeName={theme.name}
      themePriceKobo={theme.price}
      hostingFeeKobo={HOSTING_FEE_KOBO}
    />
  );
}
