import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Agora multi-tenant subdomain routing.
 *
 * Reads the incoming Host header and splits it into a subdomain and the
 * root domain. If the leftmost label is "www" or the root domain itself,
 * the request is routed to the main marketing/app pages (no rewrite).
 * Otherwise the request is rewritten to /sites/[subdomain] so a dynamic
 * route can later render that business's live site.
 *
 * On Vercel with a wildcard domain (*.agora.com), the Host header arrives
 * as e.g. "fashionbrand.agora.com" and this middleware handles it.
 * Locally, simulate subdomains by editing /etc/hosts and running with a
 * custom Host header (see README).
 */

function getSubdomain(host: string): string | null {
  // Strip port if present
  const hostname = host.split(":")[0].toLowerCase();

  const root = (process.env.ROOT_DOMAIN || "agora.test")
    .split(":")[0]
    .toLowerCase();

  // Exact match on root domain -> main app, no subdomain
  if (hostname === root) return null;

  // www is treated as the main app
  if (hostname === `www.${root}`) return null;

  // Must end with the root domain (e.g. fashionbrand.agora.test)
  const suffix = `.${root}`;
  if (!hostname.endsWith(suffix)) return null;

  const sub = hostname.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null; // reject nested subdomains

  return sub;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const subdomain = getSubdomain(host);

  // If no subdomain, continue to the normal app routes (marketing, login, etc.)
  if (!subdomain) {
    return NextResponse.next();
  }

  // Rewrite to the tenant site route. This keeps the URL in the browser
  // showing the subdomain while Next.js serves the /sites/[subdomain] page.
  const url = req.nextUrl.clone();
  url.pathname = `/sites/${subdomain}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on every request except static assets and Next internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|ico|txt|xml)$).*)",
  ],
};