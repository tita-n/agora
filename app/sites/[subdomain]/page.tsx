import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

interface PageProps {
  params: { subdomain: string };
}

export default async function SitePage({ params }: PageProps) {
  const business = await prisma.business.findUnique({
    where: { subdomain: params.subdomain },
    include: { owner: true, theme: true },
  });

  if (!business) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">{business.name}</h1>
        <p className="mt-2 text-gray-500">
          Subdomain: <code>{business.subdomain}</code>
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