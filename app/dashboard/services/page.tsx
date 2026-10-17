import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole, prisma } from "@/lib/auth";
import { ServiceManager, type ServiceRow } from "@/components/content-managers";
import { MAX_SERVICES } from "@/lib/content-limits";
import { UserNav } from "@/components/user-nav";

export const dynamic = "force-dynamic";

/** Services editor (Phase 2.5) — services + bookings theme content. */
export default async function ServicesPage() {
  const user = await requireRole(["business_owner"]);
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) redirect("/dashboard");

  const rows = (await prisma.service.findMany({
    where: { businessId: business.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, description: true, priceKobo: true, priceLabel: true },
  })) as ServiceRow[];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-4">
        <UserNav />
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <Link href="/dashboard" className="text-sm text-gray-500 underline hover:text-gray-900">← Dashboard</Link>
        </div>
        <p className="text-sm text-gray-500">
          For Studio (book on WhatsApp) and as extras on the others. Add your WhatsApp number in Profile to enable booking links.
        </p>
        <ServiceManager services={rows} limit={MAX_SERVICES} />
      </div>
    </main>
  );
}
