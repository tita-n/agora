/**
 * Pure tenant-routing logic (findings M-1 / M-2; Phase 0 domain separation),
 * kept free of Next.js imports so it can be unit-tested directly and reused
 * by custom-domain resolution.
 *
 * Phase 0 replaces the single ROOT_DOMAIN with two roots:
 *   - APP_HOST     — the product app (login, dashboard, admin, APIs). ONLY here.
 *   - SITES_DOMAIN — tenant sites live at `{label}.SITES_DOMAIN`. Third-party
 *                    template markup NEVER shares an origin or cookie scope
 *                    with the app. The `preview` label renders fixture-based
 *                    theme previews (framed only by the app).
 * Fallback: if SITES_DOMAIN is unset (transitional deploys), it equals
 * APP_HOST and *.APP_HOST serves tenants exactly as ROOT_DOMAIN did before —
 * so no deployment dies mid-migration, but the two-domain posture is a
 * documented launch requirement, not optional forever.
 * Local dev: SITES_DOMAIN=sites.localhost gives *.sites.localhost:3000.
 */
import { DOMAIN_HOST_RE } from "@/lib/domains";

/**
 * Standard DNS-label rule: 1-63 chars, lowercase alphanumeric or hyphen,
 * must start and end with an alphanumeric character. Enforcing this also
 * rejects encoded slashes (%2f), underscores, and multi-label hosts —
 * nothing unvalidated reaches a rewrite target path.
 */
export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Labels under the SITES domain that must never resolve to a tenant:
 * every top-level app route (they'd shadow nothing on this origin, but the
 * list is kept as one defense so a business can never own a word like
 * "admin" or "api" in the shared namespace) plus infrastructure words.
 * `preview` is deliberately NOT here: it is handled as its own route kind
 * before this check.
 */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "login",
  "logout",
  "dashboard",
  "developer",
  "account",
  "dev",
  "assets",
  "static",
  "cdn",
  "mail",
  "status",
  "support",
  "help",
  "root",
  "docs",
  "unauthorized",
  "sites",
  "signup",
  // internal rewrite target for the sites-origin preview surface
  "sites-preview",
  // internal rewrite target for Phase 2 custom-domain serving: no business
  // may own the subdomain the resolver route lives under
  "tenant-host",
]);

/** The reserved sites-domain label that serves theme previews. */
export const PREVIEW_LABEL = "preview";

export type TenantRoute =
  /** main app host (apex/www) — or any foreign host outside strict mode */
  | { kind: "main" }
  /** valid, non-reserved tenant label under the sites domain */
  | { kind: "tenant"; subdomain: string }
  /** preview.{SITES_DOMAIN} — fixture-based theme previews (Phase 0) */
  | { kind: "preview" }
  /** foreign host in STRICT mode: custom-domain candidate (Phase 2) —
   * rewritten to /tenant-host, which only serves when a DB-exact lookup of
   * this hostname finds a VERIFIED business domain. Nothing is trusted from
   * the host itself beyond normalization; an attacker pointing an
   * arbitrary DNS record at Vercel reaches a 404, not content. */
  | { kind: "tenantHost"; hostname: string }
  /** must 404 — malformed/reserved label, an app-subdomain in two-domain
   * mode (tenants never ride the app's parent), or a hostname that isn't
   * even syntactically valid (no DB lookup is wasted on it) */
  | { kind: "invalid" };

/**
 * Decide how a request's Host header maps onto the app.
 *
 * @param host        raw Host header value (may include a port)
 * @param appHost     bare lowercase app root, e.g. "agora.com"
 * @param sitesDomain bare lowercase tenant-sites root, e.g. "agorasites.com"
 *                    (=== appHost in transitional single-domain mode)
 * @param strict      production host allowlist (M-2): hosts that are not the
 *                    app root, www.app, a valid tenant/preview of the sites
 *                    domain, or a verified custom domain 404 instead of
 *                    falling through to the main app
 */
export function classifyHost(
  host: string,
  appHost: string,
  sitesDomain: string,
  strict: boolean
): TenantRoute {
  const hostname = host.split(":")[0].toLowerCase();
  const app = appHost.split(":")[0].toLowerCase();
  const sites = sitesDomain.split(":")[0].toLowerCase();

  // Bare localhost is the dev app (browsers resolve *.sites.localhost on
  // their own — those arrive through the sites branch below).
  if (hostname === "localhost" || hostname === "127.0.0.1") return { kind: "main" };

  // Apex and www of the app always serve the main app.
  if (hostname === app || hostname === `www.${app}`) return { kind: "main" };

  // Tenant space: exactly one label under the sites domain.
  if (hostname.endsWith(`.${sites}`)) {
    const sub = hostname.slice(0, -(sites.length + 1));
    if (sub === PREVIEW_LABEL) return { kind: "preview" };
    if (!SUBDOMAIN_RE.test(sub) || RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: "invalid" };
    }
    return { kind: "tenant", subdomain: sub };
  }

  // Two-domain mode: subdomains of the APP root are never anything — in the
  // old single-domain world they were tenants; now the sites domain owns
  // that space, so an app-subdomain host 404s (it must not fall through to
  // the main app either, keeping "app routes only on APP_HOST" literal for
  // unknown hosts; verified custom domains are handled below).
  if (sites !== app && hostname.endsWith(`.${app}`)) return { kind: "invalid" };

  // Foreign host. Development/preview: main app (localhost convenience,
  // unchanged). Production (Phase 2): a syntactically valid host becomes a
  // CUSTOM-DOMAIN candidate — resolution still requires the verified DB
  // match downstream. Anything not even shaped like a hostname 404s here,
  // preserving M-2's "no content for unvalidated hosts" guarantee.
  if (!strict) return { kind: "main" };
  if (!DOMAIN_HOST_RE.test(hostname)) return { kind: "invalid" };
  return { kind: "tenantHost", hostname };
}

/**
 * Rewrite target for a custom-domain candidate request. The theme is a
 * single page today — same as subdomain tenants, unknown sub-paths render
 * the not-found page of that site (no fall-through to main-app routes).
 */
export function tenantHostRewritePath(requestPath: string): string {
  const trimmed = trimTrailingSlash(requestPath);
  return trimmed === "/" ? `/tenant-host` : `/tenant-host${trimmed}`;
}

/**
 * Rewrite target for a tenant request (M-1 path preservation): keeps the
 * request's own path under /sites/<subdomain> so tenant hosts can expose
 * their own sub-routes later. `/` maps to the site root; a trailing slash
 * is trimmed so `/about/` and `/about` resolve identically.
 */
export function tenantRewritePath(subdomain: string, requestPath: string): string {
  const trimmed = trimTrailingSlash(requestPath);
  return trimmed === "/" ? `/sites/${subdomain}` : `/sites/${subdomain}${trimmed}`;
}

/** Rewrite target for preview.{SITES} requests. */
export function previewRewritePath(requestPath: string): string {
  const trimmed = trimTrailingSlash(requestPath);
  return trimmed === "/" ? `/sites-preview` : `/sites-preview${trimmed}`;
}

function trimTrailingSlash(requestPath: string): string {
  return requestPath.length > 1 && requestPath.endsWith("/")
    ? requestPath.slice(0, -1)
    : requestPath;
}
