import { notFound } from "next/navigation";
import Link from "next/link";
import { THEMES } from "@/themes/registry";
import { previewSiteData } from "@/lib/preview-fixtures";

/**
 * Public theme previews (Phase 2.5): render a theme from FIXTURE data — no
 * database, no tenant data, nothing that can be primed or poisoned by a
 * visitor. Used by the onboarding "choose a theme" step and later by the
 * marketing page's example sites. `?state=empty` renders the same theme
 * with only a business name — the "no content yet must still look
 * intentional" acceptance check, viewable by a human, not just in tests.
 *
 * force-dynamic: the query string drives rendering and nothing here should
 * be cached across variants (M-3's spirit; there is no per-tenant data to
 * leak, but caching would only create surprises).
 */
export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ themeKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { themeKey } = await params;
  const sp = await searchParams;
  const theme = THEMES[themeKey];
  if (!theme) notFound();

  const state = sp.state === "empty" ? "empty" : "full";
  const data = previewSiteData(theme.key, state);
  const SiteView = theme.Site;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-1.5 text-xs text-ink-faint">
        <span>
          Agora theme preview — <span className="font-semibold text-white">{theme.label}</span>
          {state === "empty" ? " · empty content" : " · example data"} · no real business
        </span>
        <span className="flex gap-3">
          <Link href={`/preview/${theme.key}?state=${state === "empty" ? "full" : "empty"}`} className="underline hover:text-white">
            {state === "empty" ? "See it full" : "See it empty"}
          </Link>
          <Link href="/" className="underline hover:text-white">
            Exit preview
          </Link>
        </span>
      </div>
      <SiteView data={data} agoraHref="/" />
    </div>
  );
}

/** Preview of the product-detail screen for themes that have one. */
export async function generateMetadata({ params }: { params: Promise<{ themeKey: string }> }) {
  const { themeKey } = await params;
  const theme = THEMES[themeKey];
  return { title: theme ? `${theme.label} — theme preview` : "Preview" };
}
