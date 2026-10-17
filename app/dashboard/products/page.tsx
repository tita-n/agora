import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { ProductManager, type ProductRow } from "@/components/content-managers";
import { MAX_PRODUCTS } from "@/lib/content-limits";
import { UserNav } from "@/components/user-nav";

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
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-4">
        <UserNav />
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <Link href="/dashboard" className="text-sm text-gray-500 underline hover:text-gray-900">← Dashboard</Link>
        </div>
        <p className="text-sm text-gray-500">
          Shown by the Boutique theme (and Bistro as the menu). Visitors order through WhatsApp — no cart, by design.
        </p>
        <ProductManager products={rows} limit={MAX_PRODUCTS} />
      </div>
    </main>
  );
}
