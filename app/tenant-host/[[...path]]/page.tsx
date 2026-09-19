import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MinimalSite } from "@/components/themes/minimal-site";
import { mainAppUrl } from "@/lib/site-urls";
import { DOMAIN_HOST_RE } from "@/lib/domains";

/**
 * Tenant serving for business-owned CUSTOM DOMAINS (Phase 2). The
 * middleware rewrites requests from foreign hosts here (production only);
 * this page is where the actual trust decision happens:
 *
 *  1. the Host header must normalize to a syntactically valid bare
 *     hostname (re-validation, same regex used at write time — the
 *     middleware classification alone is never the only gate), and
 *  2. the DB must contain a Business whose customDomain is EXACTLY that
 *     host (values are stored pre-normalized lowercase), and
 *  3. that business must have domainStatus === "verified" — i.e. Vercel
 *     confirmed DNS + issued the certificate. A pending/failed domain
 *     never serves content, even though DNS may already point here: this
 *     is what prevents a claimed-but-unverified domain from rendering
 *     someone's site over plain HTTP before TLS exists, and stops owners
 *     from pointing a domain at us before we attach it.
 *
 * Same M-3 caching rule as /sites/[subdomain]: force-dynamic, nothing here
 * may ever be cached across hostnames.
 */
export const dynamic = "force-dynamic";

const tenantSiteSelect = {
  name: true,
  logoUrl: true,
  description: true,
  primaryColor: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  domainStatus: true,
  customDomain: true,
} as const;

export default async function TenantHostPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  // Single-page theme: unknown sub-paths 404 within the tenant (mirror of
  // /sites/[subdomain] semantics — never fall through to main-app routes).
  if (path && path.length > 0) notFound();

  const host = (await headers()).get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();
  if (!DOMAIN_HOST_RE.test(hostname)) notFound();

  const business = await prisma.business.findUnique({
    where: { customDomain: hostname },
    select: tenantSiteSelect,
  });
  if (!business || business.domainStatus !== "verified") notFound();

  return <MinimalSite data={business} agoraHref={mainAppUrl()} />;
}
