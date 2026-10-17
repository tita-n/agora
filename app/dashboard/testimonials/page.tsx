import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { TestimonialManager, type TestimonialRow } from "@/components/content-managers";
import { MAX_TESTIMONIALS } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** Testimonials editor (Phase 2.5). Plain quotes — renders as text only. */
export default async function TestimonialsPage() {
  const user = await requireUser();
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
    <AppShell section="dashboard">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-ink">Testimonials</h1>
          <Link href="/dashboard" className="text-sm text-ink-muted underline hover:text-ink">← Dashboard</Link>
        </div>
        <p className="text-sm text-ink-muted">Short customer quotes shown on Boutique & Studio.</p>
        <TestimonialManager testimonials={rows} limit={MAX_TESTIMONIALS} />
      </AppShell>
  );
}
