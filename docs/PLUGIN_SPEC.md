# Agora Plugin Slot Contract v1 (this phase: contract only — implementation is a later phase)

Plugins are small, per-business add-ons (a WhatsApp float, a notice strip, …) that must
work on ANY template without the developer wiring anything. This works because the
platform — never the template — owns the injection points.

## Reserved slots (platform-defined, fixed ids)

| slot id | rendered position | typical widget |
|---|---|---|
| `floating-widget` | just before `</body>` of every tenant page, fixed position | chat/order FAB |
| `footer-strip` | inside the site footer region, above business credit | notice bar, promos |

A template MAY declare `"pluginSlots"` in `theme.json` only to *relocate* where a reserved
slot renders (via `{{ "footer-strip" | slot }}` printing the slot HTML at a better spot);
it can never suppress one. If the template doesn't print the filter anywhere, the engine
post-processor injects it before `</body>` anyway — that is the guarantee.

## Injection model (documented now; built in the plugin phase)

```
SiteData → engine render (HTML string)
  → for each reserved slot: registry.get(businessId, slotId) → [PluginFragment]
  → fragments render server-side (zod-validated data → platform-owned React components,
    NEVER arbitrary template sandbox code) → HTML
  → inserted at template slot markers or fallback positions
```

- `PluginFragment` = `{ slotId, order, componentKey, props }` — components are FIRST-PARTY
  registry entries (`lib/plugins/registry.ts`, empty object this phase). Third-party plugin
  *packages* reuse the ThemeVersion packaging + validation rules but render in a stricter
  subset (no JS at all in plugin fragments v1).
- Slot payload is delivered to fragments through the server registry only. Nothing about
  plugins is readable by templates except the slot's rendered HTML string.
- CSP implications: fragments ship no new origins; any asset a fragment needs is served
  from our own static paths. Plugins therefore inherit the site CSP unchanged.
- Plugin enable/plan gating, pricing and install UX are OUT of this phase; the empty
  registry and the injection point (engine post-processor + `slot` filter) exist so
  tenants' HTML today is already slot-ready and next phase adds zero template churn.
