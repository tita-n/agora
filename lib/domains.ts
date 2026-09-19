/**
 * Custom-domain input validation/normalization (Phase 2). Pure, so the
 * dashboard API and any later bulk import share one validator. The stored
 * value is ALWAYS the normalized lowercase ASCII hostname — tenant-host
 * resolution matches on exact string equality, so normalization IS the
 * security boundary against case/spacing/protocol smuggling.
 */

/** Normalized-hostname rule: DNS labels, lowercase, optional punycode
 * ("xn--…"), 4–253 chars total, final label alphabetic 2–24. Rejects
 * protocols, ports, paths, underscores, trailing dots, wildcards, spaces. */
export const DOMAIN_HOST_RE =
  /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;

export type DomainValidation =
  | { ok: true; domain: string }
  | { ok: false; error: string };

/**
 * Accept whatever the owner typed ("www.Shop.Example.com.", with or without
 * https://) and produce the canonical DB value, or a specific error.
 * `rootDomain` is rejected (including every *.root) so a business can never
 * claim a name inside the platform's own namespace — tenant subdomains stay
 * the platform's to route.
 */
export function normalizeCustomDomain(
  raw: unknown,
  rootDomain: string
): DomainValidation {
  if (typeof raw !== "string") return { ok: false, error: "Domain must be a string" };
  let value = raw.trim().toLowerCase();
  if (!value) return { ok: false, error: "Enter a domain, e.g. shop.example.com" };

  // Be forgiving about the two ways owners paste domains, strict about the rest.
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");

  if (value.includes(":")) return { ok: false, error: "Remove the port from the domain" };
  if (value.includes("*")) return { ok: false, error: "Wildcards are not supported — enter the exact domain" };
  if (/[^\x20-\x7e]/.test(value))
    return { ok: false, error: "Non-ASCII domains must be entered in punycode (xn--… form)" };
  if (!DOMAIN_HOST_RE.test(value))
    return { ok: false, error: `"${raw.trim()}" is not a valid domain (e.g. shop.example.com)` };

  const root = rootDomain.split(":")[0].toLowerCase();
  if (value === root || value.endsWith(`.${root}`))
    return { ok: false, error: `Domains under ${root} are managed by Agora itself` };
  if (value.endsWith(".vercel.app"))
    return { ok: false, error: "That is a Vercel host name, not your own domain" };

  return { ok: true, domain: value };
}

/** What the Vercel Domains API expects back for a CNAME target, when we
 * must give guidance WITHOUT platform access (public Vercel docs value, not
 * a secret — the same value the API's own `configuration.cname` returns). */
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";
