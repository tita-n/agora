import { env } from "./env";

/**
 * URL builders for tenant sites. Used by server code only (never shipped to
 * the browser); scheme follows ROOT_DOMAIN + environment so local
 * /etc/hosts testing and production both produce clickable URLs.
 */
function root(): string {
  return (env.ROOT_DOMAIN || "agora.test").split(":")[0].toLowerCase();
}

function scheme(): string {
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/** The tenant's live site URL for a given subdomain. */
export function tenantSiteUrl(subdomain: string): string {
  return `${scheme()}://${subdomain}.${root()}`;
}

/** The main-app (marketing / "Powered by Agora") URL a tenant site links back to. */
export function mainAppUrl(): string {
  return `${scheme()}://${root()}`;
}
