import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole, prisma } from "@/lib/auth";
import { UserNav } from "@/components/user-nav";
import { SiteDesign } from "@/components/site-design";
import { parseSiteConfig } from "@/lib/site-config";
import { tenantSiteUrl } from "@/lib/site-urls";

export const dynamic = "force-dynamic";

/** Design editor (Phase 2.5): section order/visibility + colour + fonts,
 * stored as validated Business.siteConfig JSON. */
export default async function DesignPage() {
  const user = await requireRole(["business_owner"]);
  const business = (await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      subdomain: true,
      siteConfig: true,
      primaryColor: true,
      theme: { select: { name: true } },
    },
  })) as {
    id: string;
    subdomain: string;
    siteConfig: unknown;
    primaryColor: string | null;
    theme: { name: string } | null;
  } | null;
  if (!business) redirect("/dashboard");

  const config = parseSiteConfig(business.siteConfig, business.primaryColor);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-4">
        <UserNav />
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Site design</h1>
          <Link href="/dashboard" className="text-sm text-gray-500 underline hover:text-gray-900">← Dashboard</Link>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <SiteDesign
            config={config}
            siteUrl={tenantSiteUrl(business.subdomain)}
            themeLabel={business.theme?.name ?? "Minimal"}
          />
        </div>
      </div>
    </main>
  );
}
