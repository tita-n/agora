import { resolveSiteDataById, resolveSiteProduct } from "@/lib/resolve-site";
import { renderPackagePage, sitesHtmlResponse, tenant404, businessBySubdomain, SERVICE_HTML } from "@/lib/templates/render-page";

/**
 * Tenant sites on the SITES origin (formerly a React page — now a plain
 * route handler so template HTML can never carry RSC payload or app-origin
 * state). Subdomain lookup must match EXACTLY (normalized lowercase);
 * custom-domain traffic arrives at app/tenant-host instead.
 *
 * Canonical policy (M-10): on the *.sites host, a business with a VERIFIED
 * custom domain gets a permanent redirect there.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await ctx.params;
  const url = new URL(req.url);
  const business = await businessBySubdomain(subdomain);
  if (!business) return tenant404();

  const host = req.headers.get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();
  // served on the subdomain although a verified custom domain is live →
  // canonical 308 to the domain (never the reverse; that redirect would loop)
  if (business.customDomain && business.domainStatus === "verified" && hostname !== business.customDomain) {
    return Response.redirect(`https://${business.customDomain}${url.pathname}${url.search}`, 308);
  }

  const page = url.searchParams.get("page");
  const category = url.searchParams.get("category");

  const seg = url.pathname.split("/").filter(Boolean); // ["mysite"] or ["mysite","p",id]
  if (seg.length >= 3 && seg[1] === "p") {
    const site = await resolveSiteDataById(business.id, { host, page, category });
    const product = site && (await resolveSiteProduct(business.id, seg[2]!));
    if (!site || !product) return tenant404();
    const res = await renderPackagePage({ business, site: { ...site, products: [product] }, product });
    if (!res.ok) return res.why === "not-found" ? tenant404() : sitesHtmlResponse(SERVICE_HTML, { status: res.status });
    return sitesHtmlResponse(res.html);
  }

  const site = await resolveSiteDataById(business.id, { host, page, category });
  if (!site) return tenant404();
  const res = await renderPackagePage({ business, site });
  if (!res.ok) {
    if (res.why === "not-found") return tenant404();
    return sitesHtmlResponse(SERVICE_HTML, { status: res.status });
  }
  return sitesHtmlResponse(res.html);
}
