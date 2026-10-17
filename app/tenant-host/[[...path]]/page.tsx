import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveSiteDataById } from "@/lib/resolve-site";
import { resolveTheme } from "@/themes/registry";
import { mainAppUrl } from "@/lib/site-urls";
import { DOMAIN_HOST_RE } from "@/lib/domains";
import { isOurBlobUrl } from "@/lib/blob-url";
import type { SiteProduct } from "@/lib/site-data";
import type { Metadata } from "next";

/**
 * Tenant serving for business-owned CUSTOM DOMAINS (Phase 2, routes in 2.5).
 * The middleware rewrites requests from foreign hosts here (production
 * only); this page is where the actual trust decision happens:
 *
 *  1. the Host header must normalize to a syntactically valid bare
 *     hostname (re-validation, same regex used at write time — the
 *     middleware classification alone is never the only gate), and
 *  2. the DB must contain a Business whose customDomain is EXACTLY that
 *     host (values are stored pre-normalized lowercase), and
 *  3. that business must have domainStatus === "verified" — i.e. Vercel
 *     confirmed DNS + issued the certificate.
 *
 * Path routing (Phase 2.5): the site now has real sub-routes, so this page
 * mirrors them: "" → site root, "p/<id>" → product detail (only for themes
 * that expose one); ANY other path 404s inside the tenant (never falling
 * through to main-app routes).
 *
 * Same M-3 caching rule as /sites/[subdomain]: force-dynamic, nothing here
 * may ever be cached across hostnames.
 */
export const dynamic = "force-dynamic";

const tenantHostSelect = {
  id: true,
  domainStatus: true,
  name: true,
  description: true,
  logoUrl: true,
} as const;

async function businessForHost() {
  const host = (await headers()).get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();
  if (!DOMAIN_HOST_RE.test(hostname)) return null;
  return (await prisma.business.findUnique({
    where: { customDomain: hostname },
    select: tenantHostSelect,
  })) as {
    id: string;
    domainStatus: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
  } | null;
}

function parsePath(path: string[] | undefined): { kind: "home" } | { kind: "product"; id: string } | { kind: "nope" } {
  if (!path || path.length === 0) return { kind: "home" };
  if (path.length === 2 && path[0] === "p" && /^[a-z0-9]{10,40}$/.test(decodeURIComponent(path[1]))) {
    return { kind: "product", id: decodeURIComponent(path[1]) };
  }
  return { kind: "nope" };
}

export async function generateMetadata(): Promise<Metadata> {
  const b = await businessForHost();
  if (!b || b.domainStatus !== "verified") return {};
  const description = b.description ?? `${b.name} — a site powered by Agora`;
  return {
    title: b.name,
    description,
    openGraph: { title: b.name, description, images: isOurBlobUrl(b.logoUrl) ? [{ url: b.logoUrl }] : undefined },
  };
}

export default async function TenantHostPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const route = parsePath(path);
  if (route.kind === "nope") notFound();

  const business = await businessForHost();
  if (!business || business.domainStatus !== "verified") notFound();

  const sp = await searchParams;
  const data = await resolveSiteDataById(business.id, {
    page: typeof sp.page === "string" ? sp.page : null,
    category: typeof sp.cat === "string" ? sp.cat : null,
  });
  if (!data) notFound();
  const theme = resolveTheme(data.themeKey);

  if (route.kind === "product") {
    if (!theme.ProductPage) notFound();
    const row = (await prisma.product.findFirst({
      where: { id: route.id, businessId: business.id },
      select: { id: true, name: true, description: true, priceKobo: true, category: true, inStock: true, imageUrls: true },
    })) as (Omit<SiteProduct, "imageUrls"> & { imageUrls: string[] }) | null;
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

  const SiteView = theme.Site;
  return <SiteView data={data} agoraHref={mainAppUrl()} />;
}
