import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

/**
 * Explicit field selection (finding H-1): never `include` full relations —
 * `owner: true` would pull the user row including its bcrypt `password` hash
 * into every tenant page render. Whitelist exactly what the template needs.
 */
const tenantSiteSelect = {
  name: true,
  subdomain: true,
  logoUrl: true,
  theme: {
    select: {
      name: true,
    },
  },
} as const;

export default async function SitePage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const business = await prisma.business.findUnique({
    where: { subdomain },
    select: tenantSiteSelect,
  });

  if (!business) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {business.logoUrl && (
          <Image
            src={business.logoUrl}
            alt={`${business.name} logo`}
            width={120}
            height={120}
            className="mx-auto mb-4 h-24 w-24 rounded object-contain"
          />
        )}
        <h1 className="text-4xl font-bold text-gray-900">{business.name}</h1>
        <p className="mt-2 text-gray-500">
          Subdomain: <code>{subdomain}</code>
        </p>
        {business.theme && (
          <p className="mt-1 text-sm text-gray-400">
            Theme: {business.theme.name}
          </p>
        )}
        <p className="mt-4 text-xs text-gray-400">
          Phase 0 placeholder — the real theme rendering will live here.
        </p>
      </div>
    </main>
  );
}