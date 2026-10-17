# Agora Template Package Specification v1

A template is a **data package**, never server code. It runs only inside the LiquidJS
sandbox on the renderer. A stranger's package must never reach the database, secrets,
other tenants, or our app origin. `docs/TEMPLATE_AUTHORING_RULES.md` restates these rules
for AI agents building packages; `core/agora-engine/` implements them.

## Layout

```
my-theme/
  theme.json            manifest (below) — required
  layout.liquid         page shell — required
  templates/            optional: product.liquid (only if "product" in supportedSections)
  sections/             *.liquid, one per supported section type — required dir
  snippets/             optional partials, used via {% render %}/{% include %}
  assets/               optional: css, js, images, fonts (allowlist below)
  settings_schema.json  typed, user-editable settings (below)
  fixtures/             demo SiteData, ≥1 niche + empty.json — required
```

### `theme.json` (manifest)

```json
{
  "apiVersion": 1,
  "id": "boutique",                  // [a-z0-9-]{2,40}, unique per developer
  "name": "Boutique",                // ≤ 60 chars
  "version": "1.0.0",                // strict semver, must match ThemeVersion.version
  "description": "Catalog-first …",  // ≤ 500 chars
  "categories": ["retail", "fashion"],
  "supportedSections": ["hero", "about", "products", "gallery", "testimonials", "hours", "contact"],
  "settings": { "hero_image": {"type": "boolean", "default": true} },
  "pluginSlots": ["floating-widget", "footer-strip"]   // must be a subset of platform reserved slots
}
```

### Liquid surface (what a template may reference)

`layout.liquid` renders `{{ content_for_layout }}`; templates/sections receive exactly:

| binding | type | notes |
|---|---|---|
| `business` | object | `name, tagline?, logoUrl?, about?, contactEmail?, whatsappUrl?, instagramUrl?, facebookUrl?, tiktokUrl?, mapsUrl?` |
| `hours` | array | one entry per weekday: `{ day, closed, open, close }` (strings pre-formatted; closed ⇒ render "Closed") |
| `products` | array | `{ id, name, description?, priceKobo?, priceLabel?, price, inStock, category?, imageUrls[], waLink? }` |
| `services` | array | `{ id, name, description?, priceKobo?, priceLabel?, price, waLink }` |
| `gallery` | array | `{ id, url, alt, caption? }` (`alt` is pre-derived by the loader) |
| `testimonials` | array | `{ id, authorName, quote }` |
| `sections` | array | `{ type, enabled }` in ORDER — iterate this; disabled/unknown sections render nothing |
| `settings` | object | values from tenant `siteConfig` matched against `settings_schema.json` |
| `agora` | helper | `{{ "a.png" \| asset_url }}`, `{{ url \| image_url width:800 }}`, `{{ 150000 \| money }}`, `{{ "footer-strip" \| slot }}` |

Contract v1 is fixed as `core/agora-engine/site-data.ts` (zod) with an exported JSON
Schema (`agora-site-data-v1.schema.json`). Every field is optional/array-empty-safe by
contract: templates MUST render with an empty SiteData (`fixtures/empty.json` proves it).
`waLink` fields are complete `https://wa.me/<digits>?text=<encoded>` strings built
server-side at load time.

## Authoring hard rules (validator + engine enforce; do not attempt to bypass)

1. Liquid dialect: standard tags only; NO custom tags, no `{{ 'x' | upcase | … }}` beyond
   the filter allowlist: `asset_url image_url money json_default t truncate escape
   strip_html newline_to_br url_encode date round pluralize` (engine-defined).
2. Autoescape is ON (engine-forced). Prototype/own-property access is blocked
   (`ownPropertyOnly`); `constructor`, `__proto__`, `_` prefix refs are rejected at parse.
3. Render budgets (engine-forced): template size ≤ 128 KB each, parse timeout,
   loop/render time limit from LiquidJS `renderLimit`/`memoryLimit` options, max 40
   sections deep × wide output (≤ 1 MB HTML).
4. No inline event handlers (`on*=`), no inline `<script>`, no `javascript:`/`data:` URLs
   in href/src attributes, no remote URLs for scripts/styles/images/frames/fonts —
   assets must be package files (via `asset_url`) or SiteData blob-host URLs (via
   `image_url`). No `<form action="http…">` — v1 sites have no forms except links to
   WhatsApp. `<iframe>`/`<object>`/`<embed>`/`<base>`/`<meta http-equiv>` are rejected.
5. CSS: local files only; remote `@import`, `url(http…`, `expression(` rejected.
6. JS assets are optional and are executed only on the cookieless sites origin under
   CSP (`script-src 'self'`). Advisory static scan (validator warns, does not fail):
   `eval`, `new Function`, `document.cookie`, `localStorage`, `fetch(`, `XMLHttpRequest`,
   `postMessage`. CSP is the real boundary; the scan is hygiene.
7. File types in `assets/`: `.css .js .json .svg .png .jpg .jpeg .webp .avif .woff .woff2`.
   ≤ 64 files, ≤ 256 KB/file, ≤ 2 MB total. Paths are `[a-z0-9._/-]{1,120}`, no `..`,
   no absolute paths, no symlink.
8. Sections: one file per `supportedSections` entry named `<type>.liquid`; unknown
   section types in tenant data are skipped silently; missing ones are a validator error.
9. `settings_schema.json`: `{ name, type, default }[]`, types ∈
   `boolean select color text image` (select requires `options[]`). Tenants edit these
   through the dashboard only — templates never receive raw JSON.
10. Accessibility floor: headings ordered, every `img` from SiteData has `alt`, focus
    visible (globals provide it — do not override with `outline:none`), contrast from
    settings colors is checked by the validator against the platform `readableTextColor`
    utility (warn-level).

## Packaging, delivery, runtime

- `npm run theme:validate <dir>` runs the whole rule set against good/bad expectations
  and renders `fixtures/*` (must render full AND empty without error).
- Publish flow (this phase: CLI-free, admin/dev page): zip the directory → platform
  validates → stores **immutable** `themes/{themeSlug}/{version}/package.zip` via the
  storage interface + writes `ThemeVersion` with `checksum` (sha256 of zip), manifest,
  `sizeBytes`, `fileCount`. Status transitions: draft → in_review → published | rejected
  (staff) ; published can be marked unlisted. A tenant always renders exactly one
  version: `theme.currentVersionId`; updates are opt-in per business.
- The renderer caches per (versionId, checksum) in-process: unzipped file map → LiquidJS
  custom `FileSystem` reading only from that map (path traversal is structurally
  impossible: the map lookup is the only "filesystem").
- Assets: `/sites-assets` proxy route on the sites origin serves files from the same map
  with `cache-control: public, max-age=31536000, immutable`; only paths present in the
  version manifest resolve (else 404). This is what makes `script-src 'self'` real.
- CSP on every tenant-site and preview response:
  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' BLOB_HOST data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'`
  plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options`: DENY for tenant sites, `frame-ancestors APP_HOST` for preview.
  (`style-src 'unsafe-inline'` is required by `{{ settings.color }}` inline custom
  properties; section HTML is escaped output, not styles.)
- Preview: `preview.SITES_DOMAIN/t/{themeSlug}?state=full|empty` renders from fixtures —
  the store (next phase) embeds these URLs in iframes.

## What is NOT in v1

No `{% form %}`, no metafield stores, no locale/i18n, no webhooks inside packages, no
package-to-package deps, no template JS accessing any platform API (there is none), no
direct tenant payment handling in templates. Cart/checkout remain out of scope.
