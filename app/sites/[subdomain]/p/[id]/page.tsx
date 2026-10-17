import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveSiteDataById } from "@/lib/resolve-site";
import { resolveTheme } from "@/themes/registry";
import { mainAppUrl } from "@/lib/site-urls";
import { sitesRoot } from "@/lib/site-urls";
import { isOurBlobUrl } from "@/lib/blob-url";
import type { SiteProduct } from "@/lib/site-data";

/**
 * Tenant product detail (Phase 2.5, Boutique only for now): /p/<id> under a
 * subdomain (the middleware rewrite carries custom-domain visitors' paths
 * through the same route). Themes WITHOUT a ProductPage 404 here — that is
 * the contract, not a bug.
 */
export const dynamic = "force-dynamic";

async function resolveSubdomainBusiness(subdomain: string) {
  return prisma.business.findUnique({
    where: { subdomain: subdomain.toLowerCase() },
    select: { id: true, domainStatus: true, customDomain: true },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string; id: string }>;
}): Promise<Metadata> {
  const { subdomain, id } = await params;
  const business = await resolveSubdomainBusiness(subdomain);
  if (!business) return {};
  const product = (await prisma.product.findFirst({
    where: { id, businessId: business.id }, // IDOR scope: id must belong to THIS business
    select: { name: true, description: true, priceKobo: true, imageUrls: true },
  })) as { name: string; description: string | null; priceKobo: number | null; imageUrls: string[] } | null;
  if (!product) return { title: "Item not found" };
  const b = await prisma.business.findUnique({ where: { id: business.id }, select: { name: true } });
  return {
    title: `${product.name} — ${b?.name ?? "Shop"}`,
    description: product.description ?? undefined,
    openGraph: {
      title: `${product.name} — ${b?.name ?? "Shop"}`,
      description: product.description ?? undefined,
      images: product.imageUrls.filter(isOurBlobUrl).slice(0, 1).map((u) => ({ url: u })),
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ subdomain: string; id: string }> }) {
  const { subdomain: raw, id } = await params;
  const subdomain = raw.toLowerCase();
  const business = await resolveSubdomainBusiness(subdomain);
  if (!business) notFound();

  if (business.domainStatus === "verified" && business.customDomain) {
    const host = ((await headers()).get("host") || "").split(":")[0].toLowerCase();
    const root = sitesRoot();
    if (host === `${subdomain}.${root}`) {
      permanentRedirect(`https://${business.customDomain}/p/${encodeURIComponent(id)}`);
    }
  }

  const data = await resolveSiteDataById(business.id);
  if (!data) notFound();

  const theme = resolveTheme(data.themeKey);
  if (!theme.ProductPage) notFound(); // Minimal/Bistro/Studio have no item pages

  // fetch the item business-scoped (a tampered ?id= can never surface
  // another tenant's row: the where clause owns the scope, not the caller)
  const row = (await prisma.product.findFirst({
    where: { id, businessId: business.id },
    select: { id: true, name: true, description: true, priceKobo: true, category: true, inStock: true, imageUrls: true },
  })) as Omit<SiteProduct, "imageUrls"> & { imageUrls: string[] } | null;
  if (!row) notFound();

  const product: SiteProduct = {
    id: row.id,
    name: row.name,
    description: row.description,
    priceKobo: typeof row.priceKobo === "number" && row.priceKobo >= 0 ? row.priceKobo : null,
    category: row.category,
    inStock: row.inStock !== false,
    imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls.filter(isOurBlobUrl) : [],
  };

  const ProductView = theme.ProductPage;
  return <ProductView data={data} product={product} agoraHref={mainAppUrl()} />;
}
