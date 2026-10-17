import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { SiteDesign } from "@/components/site-design";
import { parseSiteConfig } from "@/lib/site-config";
import { tenantSiteUrl } from "@/lib/site-urls";

export const dynamic = "force-dynamic";

/** Design editor (Phase 2.5): section order/visibility + colour + fonts,
 * stored as validated Business.siteConfig JSON. */
export default async function DesignPage() {
  const user = await requireUser();
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
    <AppShell section="dashboard">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-ink">Site design</h1>
          <Link href="/dashboard" className="text-sm text-ink-muted underline hover:text-ink">← Dashboard</Link>
        </div>
        <div className="rounded-md border border-rule bg-card p-5">
          <SiteDesign
            config={config}
            siteUrl={tenantSiteUrl(business.subdomain)}
            themeLabel={business.theme?.name ?? "Minimal"}
          />
        </div>
      </AppShell>
  );
}
