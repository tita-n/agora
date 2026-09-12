import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MinimalSite } from "@/components/themes/minimal-site";
import { mainAppUrl } from "@/lib/site-urls";

/**
 * Tenant site (Phase 1): renders the real "Minimal" theme from the
 * business's stored profile.
 *
 * CACHING RULE (audit finding M-3): this route is reached from many hosts
 * (middleware rewrites `*.ROOT_DOMAIN` here) AND directly by path. If you
 * ever add `revalidate`, `unstable_cache`, or an HTTP cache to this tree,
 * the subdomain MUST be part of the cache key — otherwise tenant A's HTML
 * will be served to tenant B's visitors. `force-dynamic` keeps that
 * impossible until a per-tenant cache design exists.
 */
export const dynamic = "force-dynamic";

/**
 * Explicit field selection (finding H-1): never `include` full relations —
 * only whitelist the fields the theme actually renders, so a User row (and
 * its bcrypt `password` hash) can never ride into a response.
 */
const tenantSiteSelect = {
  name: true,
  logoUrl: true,
  description: true,
  primaryColor: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
} as const;

export default async function SitePage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain: raw } = await params;
  // Middleware already lowercases; this covers direct /sites/DEMO access so
  // both entry paths resolve identically. (Subdomains are stored lowercase —
  // enforced by draftSchema's transform at creation.)
  const subdomain = raw.toLowerCase();

  const business = await prisma.business.findUnique({
    where: { subdomain },
    select: tenantSiteSelect,
  });

  if (!business) notFound();

  return <MinimalSite data={business} agoraHref={mainAppUrl()} />;
}
