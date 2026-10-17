import { prisma } from "@/lib/prisma";
import { resolveSiteDataById, resolveSiteProduct } from "@/lib/resolve-site";
import { renderPackagePage, sitesHtmlResponse, tenant404 } from "@/lib/templates/render-page";
import { SERVICE_HTML } from "@/lib/templates/render-page";

/** Product detail page on the tenant subdomain (only themes that ship
 * templates/product.liquid respond; the render service 404s the rest). */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ subdomain: string; id: string }> }) {
  const { subdomain, id } = await ctx.params;
  const business = await prisma.business.findUnique({
    where: { subdomain: subdomain.toLowerCase() },
    select: { id: true, themeId: true, customDomain: true, domainStatus: true },
  });
  if (!business) return tenant404();
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (business.customDomain && business.domainStatus === "verified" && host !== business.customDomain) {
    const url = new URL(req.url);
    return Response.redirect(`https://${business.customDomain}${url.pathname}${url.search}`, 308);
  }
  const url = new URL(req.url);
  const site = await resolveSiteDataById(business.id, { host, page: url.searchParams.get("page") });
  const product = site && (await resolveSiteProduct(business.id, id));
  if (!site || !product) return tenant404();
  const res = await renderPackagePage({ business, site: { ...site, products: [product] }, product });
  if (!res.ok) return res.why === "not-found" ? tenant404() : sitesHtmlResponse(SERVICE_HTML, { status: res.status });
  return sitesHtmlResponse(res.html);
}
