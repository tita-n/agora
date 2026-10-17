import { prisma } from "@/lib/prisma";
import { siteDataSchema, injectSlots, renderSite } from "@/core/agora-engine";
import { loadPackageByVersionId } from "@/lib/templates/loader";
import { mainAppUrl } from "@/lib/site-urls";
import { sitesHtmlResponse, tenant404 } from "@/lib/templates/render-page";

/**
 * Fixture-based theme PREVIEW on preview.{SITES_DOMAIN} (middleware
 * rewrites here). Renders the package's OWN fixtures/*.json against the
 * real engine — no DB content, no tenant data, nothing to leak — so a
 * stranger framing this host sees exactly what a buyer sees, while ?state=
 * empty proves the empty-data contract holds for that package.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const state = new URL(req.url).searchParams.get("state") === "empty" ? "empty" : "full";
  const theme = await prisma.theme.findUnique({
    where: { slug },
    select: { currentVersionId: true, status: true },
  });
  if (!theme?.currentVersionId || (theme.status !== "published" && theme.status !== "unlisted")) {
    return tenant404({ preview: true });
  }
  let pkg: Awaited<ReturnType<typeof loadPackageByVersionId>> = null;
  try {
    pkg = await loadPackageByVersionId(theme.currentVersionId);
  } catch {
    return sitesHtmlResponse(SERVICE_HTML, { status: 503, preview: true });
  }
  if (!pkg) return tenant404({ preview: true });

  const fixtureKey =
    state === "empty"
      ? "fixtures/empty.json"
      : [...pkg.files.keys()].filter((k) => k.startsWith("fixtures/") && k.endsWith(".json") && k !== "fixtures/empty.json").sort()[0] ?? "fixtures/empty.json";
  const raw = pkg.files.get(fixtureKey);
  let site;
  try {
    site = siteDataSchema.parse(JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw ?? new Uint8Array())));
  } catch {
    site = siteDataSchema.parse({ business: { name: "Empty shop" } });
  }
  let html: string;
  try {
    html = await renderSite(pkg.files, { site, manifest: pkg.manifest, assetBase: `/_assets/${pkg.versionId}/`, agoraHref: mainAppUrl() });
  } catch {
    return sitesHtmlResponse(SERVICE_HTML, { status: 500, preview: true });
  }
  return sitesHtmlResponse(injectSlots(html, {}), { preview: true });
}

const SERVICE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview unavailable</title></head><body style="font:16px/1.5 system-ui;background:#FAF7F2;color:#14261D;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center;padding:24px"><h1 style="font-size:22px;margin:0 0 8px">Preview is temporarily unavailable</h1><p style="margin:0;color:#4A5D52">The template engine could not load this package right now.</p></main></body></html>`;
