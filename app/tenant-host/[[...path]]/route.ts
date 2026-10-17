import { prisma } from "@/lib/prisma";
import { resolveSiteDataById, resolveSiteProduct } from "@/lib/resolve-site";
import { renderPackagePage, sitesHtmlResponse, tenant404 } from "@/lib/templates/render-page";
import { DOMAIN_HOST_RE } from "@/lib/domains";

/**
 * Tenant serving for business-owned CUSTOM DOMAINS (the middleware rewrites
 * foreign-host traffic here). The trust decision lives on THIS file, never
 * only on middleware classification:
 *  1. Host must normalize to a syntactically valid bare hostname;
 *  2. a Business row must have customDomain EXACTLY equal to it (stored
 *     pre-normalized lowercase);
 *  3. domainStatus must be "verified" (DNS confirmed + cert issued).
 * "" → site root; "p/<id>" → product detail; anything else 404s INSIDE the
 * tenant (never a main-app fallback).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const host = req.headers.get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();
  if (!DOMAIN_HOST_RE.test(hostname)) return tenant404();

  const business = await prisma.business.findUnique({
    where: { customDomain: hostname },
    select: { id: true, themeId: true, customDomain: true, domainStatus: true },
  });
  if (!business || business.domainStatus !== "verified" || business.customDomain !== hostname) return tenant404();

  const { path = [] } = await ctx.params;
  const url = new URL(req.url);

  if (path.length === 2 && path[0] === "p" && path[1]) {
    const site = await resolveSiteDataById(business.id, { host: hostname, page: url.searchParams.get("page") });
    const product = site && (await resolveSiteProduct(business.id, path[1]));
    if (!site || !product) return tenant404();
    const res = await renderPackagePage({ business, site: { ...site, products: [product] }, product });
    if (!res.ok) return tenant404();
    return sitesHtmlResponse(res.html);
  }
  if (path.length > 0) return tenant404();

  const site = await resolveSiteDataById(business.id, {
    host: hostname,
    page: url.searchParams.get("page"),
    category: url.searchParams.get("category"),
  });
  if (!site) return tenant404();
  const res = await renderPackagePage({ business, site });
  if (!res.ok) return tenant404();
  return sitesHtmlResponse(res.html);
}
