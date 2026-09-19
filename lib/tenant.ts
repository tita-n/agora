/**
 * Pure tenant-routing logic (findings M-1 / M-2), kept free of Next.js
 * imports so it can be unit-tested directly and reused later by
 * custom-domain resolution.
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
 * Labels under the root domain that must never resolve to a tenant:
 * every top-level route that exists in the app today (dev, unauthorized,
 * sites, api) plus infrastructure words. `www` is listed for completeness
 * but is special-cased to the main app before this check runs.
 */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "login",
  "logout",
  "dashboard",
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
  // internal rewrite target for Phase 2 custom-domain serving: no business
  // may own the subdomain the resolver route lives under
  "tenant-host",
]);

export type TenantRoute =
  /** main app host (apex/www) — or any foreign host outside strict mode */
  | { kind: "main" }
  /** valid, non-reserved tenant label under the root domain */
  | { kind: "tenant"; subdomain: string }
  /** foreign host in STRICT mode: custom-domain candidate (Phase 2) —
   * rewritten to /tenant-host, which only serves when a DB-exact lookup of
   * this hostname finds a VERIFIED business domain. Nothing is trusted from
   * the host itself beyond normalization; an attacker pointing an
   * arbitrary DNS record at Vercel reaches a 404, not content. */
  | { kind: "tenantHost"; hostname: string }
  /** must 404 — malformed/reserved label, or a hostname that is not even a
   * syntactically valid domain (no DB lookup is wasted on it) */
  | { kind: "invalid" };

/**
 * Decide how a request's Host header maps onto the app.
 *
 * @param host     raw Host header value (may include a port)
 * @param rootDomain lowercase bare root host, e.g. "agora.test"
 * @param strict   production host allowlist (M-2): hosts that are not the
 *                 root, www.root, or a valid tenant of the root are 404'd
 *                 instead of falling through to the main app
 */
export function classifyHost(
  host: string,
  rootDomain: string,
  strict: boolean
): TenantRoute {
  const hostname = host.split(":")[0].toLowerCase();
  const root = rootDomain.split(":")[0].toLowerCase();

  // Apex and www always serve the main app.
  if (hostname === root || hostname === `www.${root}`) return { kind: "main" };

  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    // Malformed, nested, or reserved — never fall through to the main app.
    if (!SUBDOMAIN_RE.test(sub) || RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: "invalid" };
    }
    return { kind: "tenant", subdomain: sub };
  }

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
  const trimmed =
    requestPath.length > 1 && requestPath.endsWith("/")
      ? requestPath.slice(0, -1)
      : requestPath;
  return trimmed === "/" ? `/tenant-host` : `/tenant-host${trimmed}`;
}

/**
 * Rewrite target for a tenant request (M-1 path preservation): keeps the
 * request's own path under /sites/<subdomain> so tenant hosts can expose
 * their own sub-routes later. `/` maps to the site root; a trailing slash
 * is trimmed so `/about/` and `/about` resolve identically.
 */
export function tenantRewritePath(subdomain: string, requestPath: string): string {
  const trimmed =
    requestPath.length > 1 && requestPath.endsWith("/")
      ? requestPath.slice(0, -1)
      : requestPath;
  return trimmed === "/" ? `/sites/${subdomain}` : `/sites/${subdomain}${trimmed}`;
}
