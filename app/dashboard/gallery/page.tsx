import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, prisma } from "@/lib/auth";
import { GalleryManager, type GalleryRow } from "@/components/content-managers";
import { MAX_GALLERY_IMAGES } from "@/lib/content-limits";
import { UserNav } from "@/components/user-nav";

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
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-4">
        <UserNav />
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <Link href="/dashboard" className="text-sm text-gray-500 underline hover:text-gray-900">← Dashboard</Link>
        </div>
        <p className="text-sm text-gray-500">
          Photos count toward your monthly storage allowance — deleting frees it up right away.
        </p>
        <GalleryManager images={rows} limit={MAX_GALLERY_IMAGES} />
      </div>
    </main>
  );
}
