import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { notFound, permanentRedirect } from "next/navigation";
import { MinimalSite } from "@/components/themes/minimal-site";
import { mainAppUrl } from "@/lib/site-urls";
import { env } from "@/lib/env";

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
  // Phase 2 canonical-host decision inputs:
  customDomain: true,
  domainStatus: true,
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

  // SEO canonicalization (Phase 2): once a custom domain is VERIFIED, the
  // subdomain URL permanently redirects to it instead of duplicating the
  // content at both hosts. 308 via permanentRedirect (preserves method).
  // Deliberately scoped to requests that arrived ON the subdomain host —
  // internal render paths (/sites/... direct previews) must never bounce.
  if (business.domainStatus === "verified" && business.customDomain) {
    const host = ((await headers()).get("host") || "").split(":")[0].toLowerCase();
    const root = (env.ROOT_DOMAIN || "agora.test").split(":")[0].toLowerCase();
    if (host === `${subdomain}.${root}`) {
      // The Minimal theme is single-page — every sub-path 404s on the
      // tenant host already (no catch-all route exists), so the only
      // request that reaches this point is the site root. When the theme
      // grows real routes, restore the original path here (the middleware
      // rewrite preserves it under /sites/<sub>…) and update this line.
      permanentRedirect(`https://${business.customDomain}/`);
    }
  }

  return <MinimalSite data={business} agoraHref={mainAppUrl()} />;
}
