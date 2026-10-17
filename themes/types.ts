/**
 * The theme contract (Phase 2.5) — this is the future developer-facing
 * boundary, so it is deliberately tiny:
 *
 *  1. A theme receives EXACTLY ONE prop object carrying a fully resolved,
 *     sanitized `SiteData` (plain JSON-shaped data — no Prisma types, no
 *     User, no session) plus the Agora billboard href.
 *  2. Themes NEVER fetch data: no DB, no cookies, no env, no headers, no
 *     next/headers, no next-auth. (This is what will later let third-party
 *     developers submit themes that are reviewable by inspection.)
 *  3. Themes NEVER render client JavaScript: no "use client", no event
 *     handlers, no state. Interaction (mobile nav, product expansion) must
 *     be CSS/HTML-native (<details>). Everything must therefore also work
 *     when rendered from the client-side onboarding wizard, which is just
 *     React rendering the same pure functions.
 *  4. Every string in SiteData is plain text (React-escaped) and every URL
 *     has been validated before it got here — themes may trust it, and so
 *     may the reviewer.
 */
import type { ReactElement } from "react";
import type { SiteData, SiteProduct } from "@/lib/site-data";

export interface SiteRenderProps {
  data: SiteData;
  agoraHref: string;
}

export interface ProductRenderProps extends SiteRenderProps {
  product: SiteProduct;
}

export interface ThemeModule {
  key: string;
  label: string;
  tagline: string;
  forWho: string;
  /** The site root. Sections must honor data.config (order/visibility). */
  Site: (props: SiteRenderProps) => ReactElement;
  /** Optional: /p/<id> product detail. Absent = product links 404. */
  ProductPage?: (props: ProductRenderProps) => ReactElement;
}
