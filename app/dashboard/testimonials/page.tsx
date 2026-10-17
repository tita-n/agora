import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole, prisma } from "@/lib/auth";
import { TestimonialManager, type TestimonialRow } from "@/components/content-managers";
import { MAX_TESTIMONIALS } from "@/lib/content-limits";
import { UserNav } from "@/components/user-nav";

export const dynamic = "force-dynamic";

/** Testimonials editor (Phase 2.5). Plain quotes — renders as text only. */
export default async function TestimonialsPage() {
  const user = await requireRole(["business_owner"]);
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) redirect("/dashboard");

  const rows = (await prisma.testimonial.findMany({
    where: { businessId: business.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, authorName: true, quote: true },
  })) as TestimonialRow[];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-4">
        <UserNav />
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Testimonials</h1>
          <Link href="/dashboard" className="text-sm text-gray-500 underline hover:text-gray-900">← Dashboard</Link>
        </div>
        <p className="text-sm text-gray-500">Short customer quotes shown on Boutique & Studio.</p>
        <TestimonialManager testimonials={rows} limit={MAX_TESTIMONIALS} />
      </div>
    </main>
  );
}
