# Template Authoring Rules — read this cold before building a package

You are an AI agent building an Agora template package. This file is the whole contract
you need; the normative version is `docs/TEMPLATE_SPEC.md`. Violating a HARD rule = your
package fails validation and never ships. Ignoring a SOFT rule = review rejection.

## Ground rules

- A package is DATA (liquid, css, images, json). It contains no executable server code and
  must never assume any runtime other than the sandbox: no Node APIs, no imports, no
  fetching, no cookies, no localStorage (HARD — advisory scan flags `fetch|cookie|Storage`
  in JS; CSP blocks them anyway).
- You only ever receive the Liquid bindings table in TEMPLATE_SPEC §"Liquid surface".
  If a field might be missing, it WILL be missing on some customer's empty site. Every
  loop over `products`, `gallery`, `hours`, `sections` must be wrapped in
  `{% if …size > 0 %}` or `{% else %}` fallback content (HARD — validator renders
  `fixtures/empty.json` and fails on any Liquid error).
- All user text is already escaped by autoescape. Never try to unescape, never build
  HTML strings with `| append:` concatenation around user fields (HARD).
- Links to WhatsApp arrive PREBUILT as `product.waLink`, `service.waLink` — print them
  (`href="{{ product.waLink }}"`); never assemble wa.me URLs yourself (HARD).
- Asset paths: `{{ 'theme.css' | asset_url }}` and images:
  `{{ gallery[0].url | image_url width: 1200 }}` — every `<img>` must carry these so
  sizes/origins stay platform-controlled (HARD).

## Package skeleton (copy this, then fill it)

```
my-theme/
  theme.json            ← manifest; "apiVersion": 1, semver, supportedSections ⊆ platform list
  layout.liquid         ← <html> shell: head, {% style %}-free links via asset_url, {{ content_for_layout }}
  sections/             ← hero.liquid, about.liquid, products.liquid, … one per supported section, named EXACTLY like the section type
  snippets/             ← shared partials (card.liquid, price.liquid)
  assets/               ← theme.css, theme.js, images (allowlist + limits: ≤64 files, ≤256KB each, ≤2MB total)
  settings_schema.json  ← tenant-editable knobs with defaults
  fixtures/
    fashion.json        ← full demo SiteData (copy from themes-packages/minimal/fixtures and edit)
    empty.json          ← {"business": {"name": "Test"}, "products": [], …all arrays empty}
```

## Section contract

The engine walks `site.sections` (order and enablement come from the tenant's saved site
config — never your choice) and for each enabled type renders `sections/<type>.liquid`,
passing the matching data slice as `section.products` / `section.gallery` / … plus the
`settings` object resolved from `settings_schema.json`. `templates/home.liquid` is
therefore just:

```liquid
{% for s in sections %}{% render s.type, section: s %}{% endfor %}
```

`{% render %}` resolves snippets from `snippets/` first, then `sections/` — so that line
is legal without copying files. Unknown `s.type` values in tenant data are filtered out by
the engine BEFORE your template sees them, but still guard with `{% if %}` anyway: the
engine's filtering is defense, not contract you may rely on.

## Worked example — complete mini theme "Kiosk"

`theme.json`
```json
{ "apiVersion": 1, "id": "kiosk", "name": "Kiosk", "version": "1.0.0",
  "description": "One-screen listing page with WhatsApp order buttons.",
  "categories": ["retail", "food"],
  "supportedSections": ["hero", "products", "contact"],
  "pluginSlots": ["floating-widget", "footer-strip"] }
```

`layout.liquid`
```liquid
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ business.name }}</title>
  <link rel="stylesheet" href="{{ 'kiosk.css' | asset_url }}">
</head>
<body class="kiosk" style="--ink: {{ settings.ink_color }}; --paper: {{ settings.paper_color }};">
  {{ content_for_layout }}
  <footer>{{ "footer-strip" | slot }}<p>{{ business.name }}</p></footer>
</body>
</html>
```

`templates/home.liquid`
```liquid
{% for s in sections %}{% render s.type, section: s %}{% endfor %}
```

`sections/hero.liquid`
```liquid
<header class="hero">
  <h1>{{ business.name }}</h1>
  {% if business.tagline %}<p>{{ business.tagline }}</p>{% endif %}
  {% if settings.show_logo and business.logoUrl %}
    <img src="{{ business.logoUrl | image_url width: 240 }}" alt="{{ business.name }}" width="120" height="120">
  {% endif %}
</header>
```

`sections/products.liquid`
```liquid
{% if section.products and section.products.size > 0 %}
<section class="products" id="products">
  <h2>What we sell</h2>
  <ul>
    {% for p in section.products %}
    <li class="card">
      {% if p.imageUrls and p.imageUrls.size > 0 %}
        <img src="{{ p.imageUrls[0] | image_url width: 600 }}" alt="{{ p.name }}" loading="lazy" width="300" height="300">
      {% endif %}
      <h3>{{ p.name }}</h3>
      {% if p.description %}<p>{{ p.description | truncate: 140 }}</p>{% endif %}
      {% if p.price %}<p class="price">{{ p.price | money }}</p>{% endif %}
      {% if p.inStock and p.waLink %}
        <a class="order" href="{{ p.waLink }}">Order on WhatsApp</a>
      {% else %}
        <span class="unavail">Ask us</span>
      {% endif %}
    </li>
    {% endfor %}
  </ul>
</section>
{% endif %}
```

`sections/contact.liquid`
```liquid
<section class="contact" id="contact">
  <h2>Find us</h2>
  {% if business.mapsUrl %}<p><a href="{{ business.mapsUrl }}">Map</a></p>{% endif %}
  {% if hours and hours.size > 0 %}
    <dl>{% for h in hours %}<dt>{{ h.day }}</dt><dd>{% if h.closed %}Closed{% else %}{{ h.open }}–{{ h.close }}{% endif %}</dd>{% endfor %}</dl>
  {% endif %}
  {% if business.whatsappUrl %}<p><a href="{{ business.whatsappUrl }}">WhatsApp</a></p>{% endif %}
</section>
```

`settings_schema.json`
```json
[ { "key": "ink_color", "label": "Ink colour", "type": "color", "default": "#14261D" },
  { "key": "paper_color", "label": "Paper colour", "type": "color", "default": "#FAF7F2" },
  { "key": "show_logo", "label": "Show logo in hero", "type": "boolean", "default": true } ]
```

`assets/kiosk.css` — mobile-first, one column; `@media (min-width: 700px)` → grid;
`.card img { aspect-ratio: 1; object-fit: cover; width: 100% }`; no remote fonts —
system stack; respect `@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none } }`.

## Pre-submit checklist (run ALL before "it's done")

1. `npm run theme:validate themes-packages/kiosk` → zero errors.
2. Renders full fixture AND `empty.json` without Liquid warnings.
3. Grep your package for banned things: `on[ a-z]+=`, `<script`, `javascript:`, `http://`,
   `https://` other than inside filter'd SiteData URLs, `@import`, `<iframe`, `<form`,
   `localStorage`, `document.cookie`. Each hit = fix.
4. Every `<img>` has `alt`; headings don't skip levels; tap targets (buttons/links in CSS)
   ≥ 44px; layout has no fixed widths > 360px; test at 360px with DevTools.
5. Sizes under limits (single `theme.css` ≤ 256 KB; no raster over 1 MB raw).
6. `theme.json.version` bumped vs previous published version (semver, never reuse).
7. You did NOT touch: `lib/`, `app/`, database, package.json dependencies. Templates only
   ever live under `themes-packages/` (HARD).
