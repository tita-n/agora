import { notFound, permanentRedirect } from "next/navigation";
import { themePreviewUrl } from "@/lib/site-urls";
import { isThemeKey } from "@/lib/theme-keys";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Canonical demo link on the APP origin: `/t/{themeSlug}` 308s to the
 * preview surface on the SITES origin (third-party template markup is only
 * ever served there — docs/ARCHITECTURE.md). Kept thin: existence check +
 * redirect, no rendering on the app origin.
 */
export default async function ThemeDemoRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isThemeKey(slug)) notFound();
  const theme = await prisma.theme.findFirst({
    where: { slug, status: "published" },
    select: { id: true },
  });
  if (!theme) notFound();
  permanentRedirect(themePreviewUrl(slug));
}
