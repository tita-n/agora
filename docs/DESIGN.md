# Agora Design System (DESIGN.md)

## Direction: "Market Ledger"

Agora serves Nigerian small businesses and the developers who build for them, most on
phones with metered data. The look is a **paper ledger in daylight**: warm off-white
sheets, deep ink-green text, a single confident brass accent, hairline rules instead of
shadows and glass. It should read like a well-kept exercise book at a busy shop —
trustworthy, unhurried, zero SaaS-gradient gloss. Not a dark neon dashboard; not
indigo-on-white generic. Density is allowed; decoration is not.

## Tokens (Tailwind theme extension — single source in `tailwind.config.ts`)

| token | value | use |
|---|---|---|
| `ink` | `#14261D` | primary text (never pure black) |
| `ink-muted` | `#4A5D52` | secondary text (4.5:1 on paper ✓) |
| `paper` | `#FAF7F2` | page background |
| `card` | `#FFFDF9` | card/surface background |
| `rule` | `#E3DCCE` | hairline borders (1px, the main divider) |
| `brass` | `#B4551D` | primary action, focus ring, active markers |
| `brass-dark` | `#8F4216` | pressed/hover on brass (AA on paper ✓) |
| `success` `#1D6B4F` / `danger` `#A32E20` / `warn` `#9A6700` | status | badges, inline errors (all AA on card) |

Type scale (mobile-first, ratio 1.25): `14/16/20/25/31/39/49` px; line-height 1.5 body,
1.15 display. Fonts are the self-hosted next/font pair already vendored in `app/fonts/`
(Phase 2.5) — reused app-wide; zero external font requests. Numerals: `font-variant-numeric:
tabular-nums` on every money figure.

Spacing 4px base (4/8/12/16/24/32/48/64); radius `6px` cards, `999px` pills for badges
only; shadows: ONE elevation token (`0 1px 2px rgb(20 38 29 / .08)`) for floating menus —
cards use borders, not shadows.

## Principles (binding)

1. **Mobile-first, every surface.** Design at 360px then widen; no horizontal scroll at
   any viewport (verify suite checks); tables collapse to stacked cards below `md`.
2. **Tap targets ≥ 44×44px** on touch (buttons, links, icon controls — padding, not font).
3. **Data-light.** Metered users: no autoplay video, no hero images > 100 KB, lists
   paginate at 24, skeletons not spinners while loading, no client JS unless behavior
   needs it (dialogs/dropdowns via Radix; nav is CSS `<details>`).
4. **Accessible by construction:** visible focus (`outline: 2px solid brass`), labels on
   every input, inline errors under fields (not only toasts), `prefers-reduced-motion`
   zeroes transitions, contrast AA (validator's `readableTextColor` guards template pairs).
5. **Money is kobo, always formatted** through `lib/money.ts` (`₦1,500`), right-aligned
   and tabular in tables.
6. Forms: one column on mobile; sticky primary action at viewport bottom on mobile when
   the form scrolls; destructive actions are typed-confirm dialogs, never bare buttons.

## Component inventory (repo-owned, Radix-headless, in `components/ui/`)

Button (primary=brass solid / secondary=ink outline / ghost / danger; sizes sm/md/lg,
md = 44px), Input, Textarea, Select (Radix), Checkbox (Radix), Card, Badge, Tabs (Radix),
Dialog (Radix), Toast (Sonner-style queue, kept dependency-free), Field (label + control +
inline error + hint), EmptyState (icon, one line, one action), Skeleton, DataTable
(desktop) → CardList (mobile) collapsing wrapper, Stepper (onboarding), StatTile,
PageHeader, AppNav (left rail ≥ lg / drawer below).

## Shell layout

App shell: `paper` page, sticky top bar (site name, account menu) + left rail 240px
(My Sites · Developer* · Admin* · Account) that becomes a slide-over drawer under `lg`;
content max-width 1080px, 16px gutters on mobile. Marketing pages: full-bleed sections,
one brass CTA per screen. Admin/dev surfaces reuse the identical shell — no side "admin
theme" fork.

## Motion

Only these: 150ms ease-out opacity/transform on dialogs, 200ms drawer slide. Nothing on
page load. Reduced-motion: everything static. (Dark mode intentionally deferred — listed
in the phase report as "tempted but out of scope".)
