import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { ServiceManager, type ServiceRow } from "@/components/content-managers";
import { MAX_SERVICES } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** Services editor (Phase 2.5) — services + bookings theme content. */
export default async function ServicesPage() {
  const user = await requireUser();
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
    <AppShell section="dashboard">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-ink">Services</h1>
          <Link href="/dashboard" className="text-sm text-ink-muted underline hover:text-ink">← Dashboard</Link>
        </div>
        <p className="text-sm text-ink-muted">
          For Studio (book on WhatsApp) and as extras on the others. Add your WhatsApp number in Profile to enable booking links.
        </p>
        <ServiceManager services={rows} limit={MAX_SERVICES} />
      </AppShell>
  );
}
