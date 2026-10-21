# Homepage & marketing actions — control ledger

The rule: every visible control on `/`, `/how-it-works`, `/pricing`, `/faq`
works today, in **every** session state, at 360/390/768/1280 px. This file is
the contract — `e2e/homepage.spec.ts` (via `npm run verify:homepage`) fails if
a control appears that is not listed below, or a listed control is missing or
mis-wired. When you change a marketing control, change it HERE first.

Statuses: ✅ worked before · 🔧 broken/unwired before, fixed now · 🆕 new real
destination built this pass · 🗑 removed (destination doesn't exist / needs
owner input)

| Where | Control | Element | Destination / action | States | Status |
|---|---|---|---|---|---|
| header | `Agora.` wordmark | link | `/` (self) | all | 🆕 (was a dead `<span>`) |
| header/menu | How it works | link | `/how-it-works` | all | 🆕 page built |
| header/menu | Pricing | link | `/pricing` | all | 🆕 page built |
| header/menu | FAQ | link | `/faq` | all | 🆕 page built |
| header/menu | Sign in | link | `/login` | signed-OUT only | ✅ (🔧 appeared while signed in — removed for signed-in) |
| header/menu | CTA | link | anon→`/signup` “Create your site”; owner→`/dashboard`; developer→`/developer`; staff→`/admin`; signed-in-no-business→`/onboard` | all | ✅ per state |
| header (≤767px) | Menu | disclosure (`<details>`) | opens/closes the mobile menu | all | 🆕 (header previously had no menu) |
| hero | CTA (same as header) | link | as above | all | ✅ |
| hero | See a real demo → | link | `/t/<cheapest published theme>` — engine-rendered preview | all, only when ≥1 published theme | 🔧 was a bare `<a>` w/o Link, no flex alignment |
| dev-track | Become a developer → | link | anon→`/signup`; signed-in non-dev→`/account` (developer switch lives there); developer→`/developer` | all | 🆕 (the dev story previously had no CTA at all) |
| themes strip | Preview (×N cards) | link | `/t/<slug>` per DB row | all | ✅ |
| pricing card | Full pricing details → | link | `/pricing` | all | 🆕 |
| page CTA (subpages) | Start now / CTA, See pricing, Read the FAQ, step-by-step | link | the real routes above | all | 🆕 |
| footer | How it works · Pricing · FAQ | links | as above | all | 🆕 |
| footer | Get a site · Sign in | links | `/signup` · `/login` | signed-OUT only | 🔧 (🔧 shown while signed in → now Account only) |
| footer | Account | link | `/account` (redirects to /login when signed out — real behavior) | all | ✅ |

## Copy ledger (truth fixes, 2026-10-21)

- 🗑 “YourAddress.agorasites.com” — domain **invented**, never configured; the
  real address is whatever `SITES_DOMAIN` is (unset in prod yet). Replaced with
  “an address of your own”. **Needs from owner:** the actual SITES_DOMAIN value.
- 🔧 “Cancel anytime; your content is yours” — no cancel UI and no export UI
  exists; `/api/business/billing-portal` exists but is not linked from the
  dashboard. Replaced with “Month to month, no contracts” + “content lives
  beside the template” (both code-backed). **Flagged:** building the billing
  button into the dashboard would make “manage your subscription here” true.
- 🔧 “paid on the 1st” — cron `0 6 1 * *` COMPUTES ledger rows on the 1st; the
  transfer itself is a human step. Copy now says exactly that.
- 🔧 “Pass, get reviewed, ship” — no review-queue UI exists; the honest claim
  is “Agora lists it after review” (admin flips status; the gate is real).
- 🔧 “usually the same day during working hours” — operational promise with no
  code behind it; removed.
- ⚠ “The platform reminds you before renewal” — true via
  `/api/cron/renewal-reminders`, but delivery needs `RESEND_API_KEY`; without
  it the reminder logs only. Either set it or the copy must soften.
- ✅ ₦5,000 = `HOSTING_FEE_KOBO` (lib/paystack.ts), 70% = `DEV_SHARE`
  (lib/billing/payouts.ts), overage table = `FUP_LIMITS` +
  `OVERAGE_RATES_KOBO_PER_GB` (lib/billing/overage.ts) — the marketing pages
  import these constants; they cannot drift from billing.

## Removed / refused (need owner input or a future phase)

- Terms of Service, Privacy policy — need YOUR legal text; no links placed.
- Contact/Support (email, phone, WhatsApp for the platform), social links —
  need YOUR handles/number; no placeholders created.
- “Data export” claim — feature doesn't exist; no FAQ line about it.

## Machine manifest (read by e2e/homepage.spec.ts)

```json
{
  "pages": ["/", "/how-it-works", "/pricing", "/faq"],
  "viewports": [360, 390, 768, 1280],
  "states": ["anon", "owner", "developer", "staff"],
  "externalAllowlist": [],
  "chrome": {
    "common": [
      { "label": "Agora.", "kind": "link", "href": "/" },
      { "label": "How it works", "kind": "link", "href": "/how-it-works" },
      { "label": "Pricing", "kind": "link", "href": "/pricing" },
      { "label": "FAQ", "kind": "link", "href": "/faq" }
    ],
    "mobileOnly": [
      { "label": "Menu", "kind": "menu-toggle" }
    ],
    "signedInCommon": [
      { "label": "Account", "kind": "link", "href": "/account" }
    ],
    "anon": [
      { "label": "Sign in", "kind": "link", "href": "/login" },
      { "label": "Get a site", "kind": "link", "href": "/signup" },
      { "label": "Create your site", "kind": "link", "href": "/signup" }
    ],
    "owner": [{ "label": "Go to dashboard", "kind": "link", "href": "/dashboard" }],
    "developer": [{ "label": "Developer console", "kind": "link", "href": "/developer" }],
    "staff": [{ "label": "Admin dashboard", "kind": "link", "href": "/admin" }]
  },
  "signedInMustNotSee": ["Sign in", "Get a site"],
  "pageScoped": {
    "/": {
      "anon": [
        { "label": "See a real demo →", "kind": "link", "hrefPattern": "^/t/[a-z0-9-]+$", "when": "hasThemes" },
        { "label": "Become a developer →", "kind": "link", "href": "/signup" }
      ],
      "owner": [
        { "label": "See a real demo →", "kind": "link", "hrefPattern": "^/t/[a-z0-9-]+$", "when": "hasThemes" },
        { "label": "Become a developer →", "kind": "link", "href": "/account" }
      ],
      "developer": [
        { "label": "See a real demo →", "kind": "link", "hrefPattern": "^/t/[a-z0-9-]+$", "when": "hasThemes" },
        { "label": "Open developer console →", "kind": "link", "href": "/developer" }
      ],
      "staff": [
        { "label": "See a real demo →", "kind": "link", "hrefPattern": "^/t/[a-z0-9-]+$", "when": "hasThemes" },
        { "label": "Become a developer →", "kind": "link", "href": "/account" }
      ],
      "all": [
        { "label": "Full pricing details →", "kind": "link", "href": "/pricing" }
      ],
      "perCard": { "label": "Preview", "kind": "link", "hrefPattern": "^/t/[a-z0-9-]+$", "when": "hasThemes" }
    },
    "/how-it-works": {
      "anon": [
        { "label": "Start now", "kind": "link", "href": "/signup" },
        { "label": "See pricing", "kind": "link", "href": "/pricing" }
      ]
    },
    "/pricing": {
      "all": [{ "label": "Questions? Read the FAQ", "kind": "link", "href": "/faq" }],
      "perCard": { "label": "Preview", "kind": "link", "hrefPattern": "^/t/[a-z0-9-]+$", "when": "hasThemes" }
    },
    "/faq": {
      "all": [{ "label": "Or see how it works, step by step", "kind": "link", "href": "/how-it-works" }]
    }
  }
}
```

`when:"hasThemes"` = expected iff the DB has ≥1 published theme (the seed
guarantees that for the e2e webserver). Sub-page CTAs for signed-in states
reuse `chrome.<state>` labels (the CTA component is shared), so e.g. an owner
on `/faq` must see “Go to dashboard”.
