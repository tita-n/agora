import { NextResponse } from "next/server";
import { renderSite, injectSlots, type SiteData } from "@/core/agora-engine";
import { sitesCspHeaders } from "@/lib/security-headers";
import { resolveHosts } from "@/lib/env";
import { mainAppUrl } from "@/lib/site-urls";
import { slotFragments } from "@/lib/plugins/registry";
import { loadPackageForTheme } from "./loader";
import { prisma } from "@/lib/prisma";

/**
 * The single render service for every sites-origin surface (tenant home,
 * product page, custom domain, fixture preview). HTML comes back as a plain
 * string from a route handler — never React, so template output can't reach
 * the app origin or an RSC payload.
 */

export type PageRender =
  | { ok: true; html: string }
  | { ok: false; status: number; why: "no-theme" | "no-package" | "not-found" | "render-failed" };

export async function renderPackagePage(opts: {
  business: { id: string; themeId: string | null } | null;
  site: SiteData;
  product?: SiteData["products"][number];
}): Promise<PageRender> {
  const b = opts.business;
  if (!b) return { ok: false, status: 404, why: "not-found" };
  if (!b.themeId) return { ok: false, status: 503, why: "no-theme" };

  let pkg: Awaited<ReturnType<typeof loadPackageForTheme>>;
  try {
    pkg = await loadPackageForTheme(b.themeId);
  } catch (err) {
    // checksum/manifest problems must never fall back to another package
    console.error(`[render:package] ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
    return { ok: false, status: 503, why: "render-failed" };
  }
  if (!pkg) return { ok: false, status: 503, why: "no-package" };
  if (opts.product && !pkg.files.has("templates/product.liquid")) {
    return { ok: false, status: 404, why: "not-found" };
  }

  let html: string;
  try {
    html = await renderSite(pkg.files, {
      site: opts.site,
      manifest: pkg.manifest,
      assetBase: `/_assets/${pkg.versionId}/`,
      agoraHref: mainAppUrl(),
      product: opts.product,
    });
  } catch (err) {
    console.error(`[render:sandbox] ${err instanceof Error ? err.message.slice(0, 160) : "unknown"}`);
    return { ok: false, status: 500, why: "render-failed" };
  }
  const fragments = await slotFragments(b.id);
  return { ok: true, html: injectSlots(html, fragments) };
}

/** HTML + the sites-origin security posture (idempotent with middleware —
 * belt for direct path access and dev hosts, where middleware may not have
 * classified this as a sites request at all). */
export function sitesHtmlResponse(html: string, init?: { status?: number; preview?: boolean; headers?: Record<string, string> }): NextResponse {
  const hosts = resolveHosts();
  return new NextResponse(html, {
    status: init?.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store", // content writes must land live (M-3)
      ...sitesCspHeaders({ preview: Boolean(init?.preview), appHost: hosts.appHost, sitesDomain: hosts.sitesDomain }),
      ...init?.headers,
    },
  });
}

export const SERVICE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site temporarily unavailable</title></head><body style="font:16px/1.5 system-ui;background:#FAF7F2;color:#14261D;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center;padding:24px"><h1 style="font-size:22px;margin:0 0 8px">This site is briefly unavailable</h1><p style="margin:0;color:#4A5D52">The template could not be loaded. The owner has been notified by the platform.</p></main></body></html>`;

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site not found</title></head><body style="font:16px/1.5 system-ui;background:#FAF7F2;color:#14261D;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center;padding:24px"><h1 style="font-size:22px;margin:0 0 8px">This site doesn&rsquo;t exist (yet)</h1><p style="margin:0;color:#4A5D52">The address you followed isn&rsquo;t claimed on Agora.</p></main></body></html>`;

export function tenant404(init?: { preview?: boolean }): NextResponse {
  return sitesHtmlResponse(NOT_FOUND_HTML, { status: 404, preview: init?.preview });
}

/** Business row trimmed to what rendering + canonical decisions need. */
export async function businessBySubdomain(subdomain: string) {
  return prisma.business.findUnique({
    where: { subdomain: subdomain.toLowerCase() },
    select: { id: true, themeId: true, customDomain: true, domainStatus: true },
  });
}
