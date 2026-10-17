import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { ProductManager, type ProductRow } from "@/components/content-managers";
import { MAX_PRODUCTS } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** Products editor (Phase 2.5). Business resolved from the SESSION — the
 * manager's API calls are scoped to it server-side, client ids never rule. */
export default async function ProductsPage() {
  const user = await requireUser();
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) redirect("/dashboard");

  const rows = (await prisma.product.findMany({
    where: { businessId: business.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, description: true, priceKobo: true, category: true, inStock: true, imageUrls: true },
  })) as ProductRow[];

  return (
    <AppShell section="dashboard">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-ink">Products</h1>
          <Link href="/dashboard" className="text-sm text-ink-muted underline hover:text-ink">← Dashboard</Link>
        </div>
        <p className="text-sm text-ink-muted">
          Shown by the Boutique theme (and Bistro as the menu). Visitors order through WhatsApp — no cart, by design.
        </p>
        <ProductManager products={rows} limit={MAX_PRODUCTS} />
      </AppShell>
  );
}
