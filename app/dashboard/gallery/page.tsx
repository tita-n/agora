import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { GalleryManager, type GalleryRow } from "@/components/content-managers";
import { MAX_GALLERY_IMAGES } from "@/lib/content-limits";

export const dynamic = "force-dynamic";

/** Gallery editor (Phase 2.5). Uploads ride the same signed blob-token
 * flow as logos (products/gallery lanes); deletes free the storage. */
export default async function GalleryPage() {
  const user = await requireUser();
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) redirect("/dashboard");

  const rows = (await prisma.galleryImage.findMany({
    where: { businessId: business.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, url: true, caption: true },
  })) as GalleryRow[];

  return (
    <AppShell section="dashboard">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-ink">Gallery</h1>
          <Link href="/dashboard" className="text-sm text-ink-muted underline hover:text-ink">← Dashboard</Link>
        </div>
        <p className="text-sm text-ink-muted">
          Photos count toward your monthly storage allowance — deleting frees it up right away.
        </p>
        <GalleryManager images={rows} limit={MAX_GALLERY_IMAGES} />
      </AppShell>
  );
}
