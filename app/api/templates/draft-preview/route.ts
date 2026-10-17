import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHosts } from "@/lib/env";
import { isOurBlobUrl } from "@/lib/blob-url";
import { normalizeHexColor } from "@/lib/color";
import { siteDataSchema, renderSite, injectSlots } from "@/core/agora-engine";
import { loadPackageByVersionId } from "@/lib/templates/loader";
import { mainAppUrl } from "@/lib/site-urls";

/**
 * Onboarding-wizard draft preview: renders the SELECTED published package
 * with the draft's name/description/color (no DB writes, no tenant data).
 * Same-origin contract enforced here (Origin must equal the app origin —
 * the browser sends it on every modern POST), and the response is consumed
 * into a sandbox="allow-scripts" iframe srcdoc: opaque origin, no cookies.
 */
const bodySchema = z
  .object({
    themeSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logoUrl: z.string().max(400).optional(),
    subdomain: z.string().max(63).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const { appHost } = resolveHosts();
  const origin = req.headers.get("origin");
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      return NextResponse.json({ error: "bad origin" }, { status: 403 });
    }
    if (o.host.toLowerCase() !== appHost.toLowerCase()) {
      return NextResponse.json({ error: "cross-origin" }, { status: 403 });
    }
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid draft" }, { status: 400 });

  const theme = await prisma.theme.findUnique({
    where: { slug: parsed.data.themeSlug },
    select: { currentVersionId: true, status: true },
  });
  if (!theme?.currentVersionId || (theme.status !== "published" && theme.status !== "unlisted")) {
    return NextResponse.json({ error: "unknown theme" }, { status: 404 });
  }
  let pkg: Awaited<ReturnType<typeof loadPackageByVersionId>> = null;
  try {
    pkg = await loadPackageByVersionId(theme.currentVersionId);
  } catch {
    return new NextResponse("engine unavailable", { status: 503 });
  }
  if (!pkg) return new NextResponse("engine unavailable", { status: 503 });

  const site = siteDataSchema.parse({
    business: {
      name: parsed.data.name,
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.logoUrl && isOurBlobUrl(parsed.data.logoUrl) ? { logoUrl: parsed.data.logoUrl } : {}),
    },
    meta: { title: parsed.data.name.slice(0, 120), ...(parsed.data.description ? { description: parsed.data.description.slice(0, 300) } : {}) },
    settings: {
      primary_color: normalizeHexColor(parsed.data.primaryColor ?? null) ?? "#111827",
      font_pair: "clean",
    },
    sections: pkg.manifest.supportedSections.map((type) => ({ type, enabled: true })),
  });

  let html: string;
  try {
    html = await renderSite(pkg.files, { site, manifest: pkg.manifest, assetBase: `/_assets/${pkg.versionId}/`, agoraHref: mainAppUrl() });
  } catch {
    return new NextResponse("render failed", { status: 500 });
  }
  return new NextResponse(injectSlots(html, {}), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
