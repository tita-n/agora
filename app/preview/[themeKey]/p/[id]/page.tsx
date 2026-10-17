import { notFound } from "next/navigation";
import Link from "next/link";
import { THEMES } from "@/themes/registry";
import { previewSiteData, previewProduct } from "@/lib/preview-fixtures";

/**
 * Product-detail half of the public previews (Phase 2.5) so the Boutique
 * card links work inside /preview. Same zero-data guarantee as the root
 * preview: fixtures only, no DB.
 */
export const dynamic = "force-dynamic";

export default async function PreviewProductPage({ params }: { params: Promise<{ themeKey: string; id: string }> }) {
  const { themeKey, id } = await params;
  const theme = THEMES[themeKey];
  if (!theme || !theme.ProductPage) notFound();
  const product = previewProduct(theme.key, id);
  if (!product) notFound();

  const data = previewSiteData(theme.key, "full");
  const ProductView = theme.ProductPage;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 bg-gray-900 px-4 py-1.5 text-xs text-gray-300">
        <span>
          Agora theme preview — <span className="font-semibold text-white">{theme.label}</span> · item page · example data
        </span>
        <Link href={`/preview/${theme.key}`} className="underline hover:text-white">
          Back to preview
        </Link>
      </div>
      <ProductView data={data} product={product} agoraHref="/" />
    </div>
  );
}
