/**
 * Security headers for everything served on the SITES origin (tenant sites,
 * custom domains, previews). Built as a tiny pure module so middleware,
 * route handlers and tests share ONE definition (docs/TEMPLATE_SPEC.md).
 *
 * CSP rationale (Phase 0): tenant HTML is third-party template output, so
 * the sites origin is hardened like an untrusted sandbox:
 *  - default-src 'none': nothing loads unless explicitly allowed below
 *  - script-src 'self': package JS only when proxied through /_assets on
 *    THIS origin — the blob host can never execute here
 *  - style-src 'self' 'unsafe-inline': package CSS + the platform-injected
 *    :root style element (settings colors) need inline styles; there is no
 *    user-controlled styling path beyond escaped settings colors
 *  - img-src: self (proxied assets) + the blob store + data: (per spec)
 *  - no forms worth posting anywhere else, no <base> hijacks, no framing
 */

const BLOB_IMG_SRC = "https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com";

export function sitesCsp(opts: { preview: boolean; appHost: string; sitesDomain: string }): string {
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  // preview pages are embeddable by the app (store previews); live tenant
  // sites refuse all framing.
  const frameAncestors = opts.preview ? `frame-ancestors ${scheme}://${opts.appHost}` : "frame-ancestors 'none'";
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' ${BLOB_IMG_SRC} data:`,
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "manifest-src 'self'",
    frameAncestors,
  ].join("; ");
}

/** Full header set for a sites-origin response. */
export function sitesCspHeaders(opts: { preview: boolean; appHost: string; sitesDomain: string }): Record<string, string> {
  return {
    "content-security-policy": sitesCsp(opts),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    // X-Frame-Options has no frame-ancestors equivalent for the preview
    // exemption, so it is set only where framing is denied outright.
    ...(opts.preview ? {} : { "x-frame-options": "DENY" }),
  };
}
