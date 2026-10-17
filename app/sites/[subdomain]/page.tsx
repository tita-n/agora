import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolveSiteDataById, loadSiteMeta } from "@/lib/resolve-site";
import { resolveTheme } from "@/themes/registry";
import { mainAppUrl } from "@/lib/site-urls";
import { sitesRoot } from "@/lib/site-urls";

/**
 * Tenant site (Phase 1 → 2.5): resolves the business by subdomain, builds
 * the sanitized SiteData (content, validated config, server-side product
 * pagination + category filter) and hands it to the business's THEME.
 *
 * CACHING RULE (audit finding M-3): this route is reached from many hosts
 * (middleware rewrites `*.ROOT_DOMAIN` here) AND directly by path. If you
 * ever add `revalidate`, `unstable_cache`, or an HTTP cache to this tree,
 * the subdomain AND the query (page/cat) MUST be part of the cache key —
 * otherwise tenant A's HTML will be served to tenant B's visitors.
 * `force-dynamic` keeps that impossible until a per-tenant cache design
 * exists; content writes go through /api/business/* which never writes an
 * ISR revalidation tag today, so any future cache MUST revalidate on every
 * content mutation (the M-3 requirement, restated here on purpose).
 */
export const dynamic = "force-dynamic";

/**
 * Explicit field selection (finding H-1): never `include` full relations —
 * only whitelist the fields the canonical-host decision needs, so a User row
 * (and its bcrypt `password` hash) can never ride into a response.
 */
const hostDecisionSelect = {
  id: true,
  domainStatus: true,
  customDomain: true,
} as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain: raw } = await params;
  const subdomain = raw.toLowerCase();
  const business = await prisma.business.findUnique({ where: { subdomain }, select: { id: true } });
  if (!business) return { title: "Site not found" };
  const meta = await loadSiteMeta(business.id);
  if (!meta) return { title: "Site not found" };
  const description = meta.description ?? `${meta.name} — a site powered by Agora`;
  return {
    title: meta.name,
    description,
    openGraph: {
      title: meta.name,
      description,
      images: meta.logoUrl ? [{ url: meta.logoUrl }] : undefined,
    },
  };
}

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ subdomain: string }>;
  searchParams: SearchParams;
}) {
  const { subdomain: raw } = await params;
  // Middleware already lowercases; this covers direct /sites/DEMO access so
  // both entry paths resolve identically. (Subdomains are stored lowercase —
  // enforced by draftSchema's transform at creation.)
  const subdomain = raw.toLowerCase();

  const business = await prisma.business.findUnique({
    where: { subdomain },
    select: hostDecisionSelect,
  });
  if (!business) notFound();

  // SEO canonicalization (Phase 2, extended in 2.5 for sub-paths): once a
  // custom domain is VERIFIED the subdomain URL 308s to it.
  if (business.domainStatus === "verified" && business.customDomain) {
    const host = ((await headers()).get("host") || "").split(":")[0].toLowerCase();
    const root = sitesRoot();
    if (host === `${subdomain}.${root}`) {
      // root request → custom-domain root; sub-paths have their own pages
      // (each carries this same decision for its own path).
      permanentRedirect(`https://${business.customDomain}/`);
    }
  }

  const sp = await searchParams;
  const page = typeof sp.page === "string" ? sp.page : null;
  const cat = typeof sp.cat === "string" ? sp.cat : null;

  const data = await resolveSiteDataById(business.id, { page, category: cat });
  if (!data) notFound();

  const theme = resolveTheme(data.themeKey);
  const SiteView = theme.Site;
  return <SiteView data={data} agoraHref={mainAppUrl()} />;
}
