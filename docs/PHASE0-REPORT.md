# Agora Real — Phase 0 final report

Date: 2026-10-17 · Branch `arena/01a0934c-agora` · Head after Phase 0: see `git log` (Steps 2–7 each committed; deploy verified READY on the final head)

## What Phase 0 delivered

1. **Audit** — every pre-existing engine-side feature catalogued and KEPT working
   (host resolution, payment provider abstraction + Paystack, usage/overage
   billing, custom domains + DNS verification, payout ledger, crons, admin).
2. **Docs** — `docs/ARCHITECTURE.md`, `docs/TEMPLATE_SPEC.md`,
   `docs/PLUGIN_SPEC.md`, `docs/DESIGN.md`, `AGENTS.md`: the contract everything
   below implements.
3. **Domain separation** — `APP_HOST` (app) vs `SITES_DOMAIN` (tenant +
   preview traffic). Middleware classifies hosts; tenant HTML never renders on
   the app origin in production; session cookies stay host-only to the app.
4. **Accounts & auth** — one account = customer + developer (no role at
   signup). `User{isStaff,emailVerifiedAt,passwordChangedAt}` +
   `DeveloperProfile` capability model; email verify + password reset tokens
   (sha256-hashed, single-use, expiring); DB-backed login rate limiter behind
   an interface; zero-enumeration everywhere (202 semantics); bcrypt behind a
   swappable verifier; capabilities read from the DB on every guarded render,
   never from the JWT.
5. **Design system** — "Market Ledger" tokens (brass accent, ink/paper/rule
   palette, Playfair/Inter via `next/font`), `components/ui/*` primitives, a
   single `AppShell` for dashboard/developer/admin, a DB-driven marketing home,
   and every one of the 44 existing screens converted (no visual regressions
   left half-done; destructive actions confirm; toasts for action feedback).
6. **Template engine** — the big one:
   * `core/agora-engine/` — a PURE (zod + liquidjs only, grep-enforced) engine:
     SiteData v1 contract, package rules, validator, sandboxed renderer.
     Sandbox posture is fixed in code: LiquidJS `templates` in-memory map (the
     filesystem is bypassed — path traversal is structurally impossible, not
     "checked"), autoescape ON, `ownPropertyOnly`, `strictFilters`,
     parse/render/memory limits, output budget 1 MB.
   * Four REAL packages in `themes-packages/` (minimal, boutique, bistro,
     studio) with manifests, settings schemas, vendored woff2 fonts, fixtures
     (`full` + `empty`) and LICENSE; the engine's own validator renders every
     fixture during validation — a package that crashes on empty data can not
     ship. Demo Boutique renders the full old-React-theme feature set plus
     per-product detail pages.
   * Publish pipeline: `npm run theme:validate` + `npm run theme:publish`
     (zip → sha256 → immutable blob object → `ThemeVersion` row →
     deliberate `currentVersionId` flip). Checksum mismatch = fail closed, no
     fallback. Local `local:<slug>` storage works in dev/Vercel-preview only.
   * Serving moved from React pages to route handlers: tenant home/product on
     subdomains, custom-domain `[[...path]]`, fixture previews on
     `preview.{sites}/t/{slug}?state=full|empty`, `/_assets/{versionId}/…`
     (map-is-allowlist, immutable, nosniff), and a same-origin-guarded
     draft-preview API the onboarding wizard consumes into a
     `sandbox="allow-scripts"` iframe (opaque origin — no cookies, no storage,
     no same-origin reads).
   * Plugin slots: the two reserved slots exist end-to-end as an injection
     contract with an empty registry (`lib/plugins/`). No plugins were built —
     by design, Phase 0 ships the seam only.
   * The old React themes (`themes/`, `app/preview`, preview-fixtures, the
     `.site` globals shim) are DELETED — one render path, no drift.
7. **Verification** — `npm run verify` chains every suite: auth 19 + ops 30 +
   phase2 58 + phase25 97 + engine 82 (escape attempts, prototype access,
   runaway loops, map containment, filter posture, planted-bad-package
   blocking, full+empty renders for all 4 packages, manifest↔key parity) +
   `theme:validate` on all packages, and `migrate:check` — the ENTIRE
   migration history applied to a real Postgres (PGlite/WASM, in-process,
   offline) plus CHECK-contract probes that insert live rows. Added after
   Neon rejected the hand-written Phase 2.5 CHECK (`cannot use subquery in
   check constraint`, SQLSTATE 0A000) — shadow-diff review could not see
   that; execution does. All green in-sandbox (286 assertions).
   A real Playwright e2e suite (`e2e/flows.spec.ts`) is written covering the
   live flows — see "What could not run here".

## Deploy status

* Vercel built the final head and reached **READY** (state `READY`, alias
  assigned, real `prisma generate` + full type-check + `next build` pass)
  after three fix rounds: relation shape P1012 (one doubly-owned relation
  became two), then two stale call-sites the sandbox's stub client cannot see
  (`dev.email` through the repointed payout relation; `role` in
  `create-admin`). Everything here was hand-audited against the real-codegen
  rules afterwards.
* The sandbox cannot open sockets to `*.vercel.app`, so runtime probing of the
  live URL from here was impossible — the READY build + suites are the
  verifiable ceiling from this environment.

## Action required from you

1. **Apply the two pending migrations** against every DB this code touches:
   `npx prisma migrate deploy` (adds Phase 2.5 content tables + the Phase 0
   accounts/engine schema with all backfills: role→isStaff, developer users →
   DeveloperProfile rows, Theme.templateKey→slug, existing accounts verified,
   payout ledger repointed). If a DB was managed by `db push`, mark or re-run
   accordingly.
2. **Set the two domain env vars** on the Vercel project when you wire real
   domains: `APP_HOST` and `SITES_DOMAIN` (+ wildcard `*.sites.…` to the
   project). Until then the app serves everything single-domain (dev fallback)
   and tenant routes answer on the same host — by design, not a bug.
3. Optional, production: `npm run theme:publish themes-packages/<slug>` (with
   `BLOB_READ_WRITE_TOKEN`) so live tenants read packages from blob storage
   instead of the repo (`local:` keys are refused in production).

## Temptations deliberately NOT built (out of Phase 0 scope)

* Online store/checkout, invoicing, or any product beyond rendering + billing.
* Any actual plugin (the slot contract + empty registry ship; a "WhatsApp
  float" widget was within reach and was NOT taken).
* A developer console / theme-builder UI, and a CLI (`agora publish`).
* A review/moderation queue for `in_review`/`rejected` statuses (the enum and
  the gates exist; no UI).
* Legal copy (TOS/privacy), transactional email polish (soft-fail by design),
  sitemap/SEO plugins, analytics, i18n, dark mode, image-resize service
  (`image_url` is pass-through; Vercel Blob has no transforms here).
* Upstash/Redis rate limiting (the DB-backed limiter sits behind the same
  interface).
* Session-wide invalidation on password reset (`passwordChangedAt` is written;
  enforcement deferred, as designed).

## Known honesty ledger

* "Login errors are generic by design; enumeration tests live in
  `scripts/auth-units.ts` (19 assertions — the Step-4 commit message said 24
  before the reset/resend dedupe)".
* e2e (`npm run test:e2e`) reports SKIPPED in this sandbox with both exact
  reasons (no reachable Postgres for the suite's webserver, no Chromium
  binary — `cdn.playwright.dev` is blocked). It is NOT fake-green; where a DB
  and browser exist it runs against the real stack, screenshots included.
* `next build` here type-checks against a permissive stub client for Prisma —
  Vercel is the real typecheck environment; every relation/column touched by
  this phase was hand-audited against `schema.prisma`, and the three findings
  above were fixed (schema P1012, payout include, create-admin).
* Package contrast/typography: each theme ships its own CSS; fonts are
  bundled (woff2 subsets) for boutique/bistro/studio; minimal uses system
  stacks (fastest first paint on expensive mobile data).
