import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveHosts } from "@/lib/env";
import { sitesCspHeaders } from "@/lib/security-headers";
import {
  classifyHost,
  tenantRewritePath,
  tenantHostRewritePath,
  previewRewritePath,
} from "@/lib/tenant";

/**
 * Agora multi-tenant routing (M-1/M-2 + Phase 0 domain separation).
 *
 * Decision per request, from the Host header only (never X-Forwarded-Host):
 *  - APP_HOST / www.APP_HOST                      -> main app
 *  - <label>.SITES_DOMAIN (valid, non-reserved)   -> rewrite /sites/<label>/…
 *    + strict sites-origin security headers (CSP etc. — third-party template
 *    output NEVER shares an origin with the app; unknown paths under a tenant
 *    render the tenant 404, never app routes)
 *  - preview.SITES_DOMAIN                         -> fixture-based theme
 *    previews (framed by APP_HOST only)
 *  - anything else                                -> main app in development;
 *    in production, a CUSTOM-DOMAIN candidate (DB-exact verified lookup at
 *    /tenant-host; unattached/unverified hosts 404, never the app). Strict
 *    mode exempts Vercel PREVIEW deployments (*.vercel.app hosts;
 *    VERCEL_ENV is platform-injected and cannot be forged via headers).
 *
 * Malformed/reserved labels 404 immediately. Existence of the tenant itself
 * is resolved by the page via the DB — a valid but unknown tenant renders
 * the tenant-scoped "Site not found" 404, not the main app.
 */

function tenantNotFound(): NextResponse {
  return new NextResponse("404 — Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const { appHost, sitesDomain } = resolveHosts();

  const strictHosts =
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV !== "preview";

  const route = classifyHost(host, appHost, sitesDomain, strictHosts);
  const path = req.nextUrl.pathname;

  if (route.kind === "main") {
    // /sites-preview is only ever an internal rewrite target — if someone
    // hits it directly on the APP origin, send them to the canonical
    // preview.SITES origin (308, matching the custom-domain canonicalization).
    if (path === "/sites-preview" || path.startsWith("/sites-preview/")) {
      const url = req.nextUrl.clone();
      const previewHost = sitesDomain.replace(/:\d+$/, ""); // dev ports handled below
      url.hostname = `preview.${previewHost}`;
      url.port = sitesDomain.includes(":") ? sitesDomain.split(":")[1] : "";
      url.pathname = path;
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }
  if (route.kind === "invalid") return tenantNotFound();

  let res: NextResponse;
  if (route.kind === "tenantHost") {
    const url = req.nextUrl.clone();
    url.pathname = tenantHostRewritePath(path);
    res = NextResponse.rewrite(url);
  } else if (route.kind === "preview") {
    const url = req.nextUrl.clone();
    url.pathname = previewRewritePath(path);
    res = NextResponse.rewrite(url);
  } else {
    // Rewrite to the tenant site route, preserving the request's sub-path
    // (M-1 path preservation) so tenant hosts expose their own sub-routes.
    const url = req.nextUrl.clone();
    url.pathname = tenantRewritePath(route.subdomain, path);
    res = NextResponse.rewrite(url);
  }

  // Every sites-origin response carries the strict posture; preview may be
  // framed by the app only.
  for (const [k, v] of Object.entries(
    sitesCspHeaders({ preview: route.kind === "preview", appHost, sitesDomain })
  )) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  // Static asset paths skip middleware: package assets answer their own
  // headers at /_assets (immutable cache) and must NOT be rewritten.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|_assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|ico|txt|xml|woff2?)$).*)",
  ],
};
