import { resolveHosts } from "./env";

/**
 * URL builders for tenant sites (server code only; never shipped to the
 * browser). Scheme follows environment so local dev and production both
 * produce clickable URLs. Phase 0: tenant URLs live under SITES_DOMAIN,
 * the app under APP_HOST — these helpers are the ONLY place either is
 * interpolated into a URL.
 */
function scheme(): string {
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/** Bare lowercase host that serves tenant sites (port kept for *.sites.localhost dev). */
export function sitesRoot(): string {
  const { sitesDomain } = resolveHosts();
  return sitesDomain;
}

/** The tenant's live site URL for a given subdomain. */
export function tenantSiteUrl(subdomain: string): string {
  return `${scheme()}://${subdomain}.${sitesRoot()}`;
}

/** Canonical preview URL for a theme package on the sites origin. */
export function themePreviewUrl(themeSlug: string, state: "full" | "empty" = "full"): string {
  const q = state === "empty" ? "?state=empty" : "";
  return `${scheme()}://preview.${sitesRoot()}/t/${encodeURIComponent(themeSlug)}${q}`;
}

/** The main-app URL a tenant site links back to ("Powered by Agora"). */
export function mainAppUrl(): string {
  const { appHost } = resolveHosts();
  return `${scheme()}://${appHost}`;
}

/** Full app-origin URL for a path (emails, callbacks). */
export function appUrl(path: string): string {
  return `${mainAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
