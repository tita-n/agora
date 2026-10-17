# Agora Architecture (Phase 0 — real-product foundation)

Agora is a marketplace and hosting platform for small-business websites. Developers (and
their AI agents) build template packages and plugins; businesses preview a real running
template, subscribe monthly, and go live. This document is the source of truth for system
shape. Product intent lives in `docs/DESIGN.md`; the template contract in
`docs/TEMPLATE_SPEC.md`; the slot contract in `docs/PLUGIN_SPEC.md`; agent-facing rules in
`docs/TEMPLATE_AUTHORING_RULES.md`.

## Domains (security foundation)

Two registrable domains. Third-party template markup is rendered on `SITES_DOMAIN`, so it
can never read or collide with app cookies, storage or history:

| Host | Serves | Cookies |
|---|---|---|
| `APP_HOST` (e.g. `agora.com`) | `/`, `/login`, `/signup`, `/account`, `/dashboard`, `/developer`, `/admin`, `/onboard`, all `/api/*` | host-only session cookie (`next-auth.session-token`, never domain-scoped) |
| `*.SITES_DOMAIN` (e.g. `{sub}.agorasites.com`) | tenant sites, tenant product pages, theme preview fixtures (`preview` reserved subdomain), proxied package assets (`/_assets/*`) | none — the sites origin is cookieless for app purposes |
| Verified custom domains | tenant sites only (exact DB match, `domainStatus=verified`) | same as `*.SITES_DOMAIN` |
| Local dev | `localhost:3000` = app; `*.sites.localhost:3000` = tenants (browsers resolve `*.localhost`) | |

Middleware (`middleware.ts` + `lib/tenant.ts` `classifyHost`) is the single routing brain:
- App hosts see app routes; a tenant-label request on an app host 404s, and vice versa
  (app routes are never served on `*.SITES_DOMAIN`).
- Subdomain labels: strict DNS-label regex; reserved list includes `preview`, `www`,
  `admin`, `api`, `app`, `sites`, … ; nested labels (`a.b`) 404; paths preserved verbatim.
- Production: strict host allowlist (app host + sites suffixes only) with the Vercel
  preview-deployment exemption (`VERCEL_ENV=preview`); custom domains are the one
  validated extra path, resolved via DB-exact verified lookup at request time.

## Layers

```
app/            Next.js App Router — pages + route handlers (the ONLY prisma/next-auth/env entrypoint)
components/     shared UI (design system primitives live here, repo-owned, Radix-headless)
lib/            server services: db, auth, billing, blob, domains, email, env, tenant,
                content (zod schemas), site-data (loader), rate-limit, storage adapters
core/agora-engine/  PURE template engine (LiquidJS wrapper + SiteData types + validator).
                MUST import nothing from next/*, @prisma/*, react — enforced by unit test.
                This is the seed of the future standalone npm package for developers.
themes-packages/    first-party template packages (data, not code): one dir per theme,
                each in TEMPLATE_SPEC package layout, validated by `npm run theme:validate`.
```

Rules that keep layers honest:
- Templates are **data**, never server code. Nothing in a package executes on the server
  except through the LiquidJS sandbox. No `import`, no React, no eval, no `require` ever.
- Pages that read the session or tenant data are `dynamic`; any caching is keyed by
  host and revalidated on every content write (M-3 invariant).
- All user text renders through React escaping or Liquid autoescape (engine-forced on).
  No `dangerouslySetInnerHTML`.
- `businessId` is derived server-side from the session's owner, never from the client;
  every row access is `where: { id, businessId }` (IDOR pattern).
- All env access through `lib/env.ts` (zod-validated). No secrets in code, logs, commits.

## Request flow, tenant site

```
host → classifyHost → resolve business (subdomain label or verified custom domain)
     → business.theme → ThemeVersion (immutable package) → engine render (cache: versionId+checksum)
     → CSP + security headers → HTML
```

- Packages are stored immutably in Blob storage behind `lib/storage.ts` (interface; Vercel
  Blob today, R2 later). A published version is never mutated; edits create versions.
- Package assets are served to tenants through the `/_assets/{versionId}/{relpath}` route
  on the sites domain (proxied from storage, `immutable` cache header). This exists so the
  strict CSP (`script-src 'self'`) works while packages live off-origin; relpaths are
  validated against the version's file manifest — no traversal, no arbitrary fetch.
- `SiteData` (contract v1: `core/agora-engine/site-data.ts`, zod + exported JSON Schema)
  is the ONLY data a template sees: business profile, contact/WhatsApp/socials/hours,
  products, services, gallery, testimonials, ordered enabled sections, theme settings.
  The loader (`lib/site-data.ts`) reads from the Phase 2.5 content tables. Templates must
  render with full data AND empty data.
- WhatsApp order/book links are built server-side into absolute `https://wa.me/…` strings
  in SiteData; templates only print them. No client logic, no payment collection in v1.

## Data model (current → Phase 0 target)

Kept as-is (audited engines — do not rewrite): `Business`, `Product`, `Service`,
`GalleryImage`, `Testimonial`, `OnboardingSession`, `PendingPayment`, `UsageRecord`,
`DevPayout`, `Theme` (extended, below), payment provider abstraction (manual/Paystack),
billing/overage math, custom-domain verification (Vercel domains API), cron endpoints,
secure blob upload flow (token → upload → persist).

Phase 0 changes:
- **`Role` enum removed.** `User.isStaff Boolean @default(false)` + `confirmedEmailAt`
  + `passwordChangedAt`. Capability = computed per guarded render from DB (the existing
  fresh-read pattern), never from the JWT snapshot.
- **`DeveloperProfile`** `{ id, userId @unique, displayName?, bio?, payoutBank fields for
  ledger continuity }`. `Theme.devId` reparents to `DeveloperProfile`.
- **`Theme` extends**: `slug @unique`, `description`, `categories String[]`, `status`
  (draft | in_review | published | rejected | unlisted), `currentVersionId`.
  `templateKey` (React-theme selector) is dropped once all four Liquid packages render —
  Business resolves its theme through `Theme.currentVersionId` only.
- **`ThemeVersion`** `{ id, themeId, version (semver, unique per theme), manifest Json,
  storageKey, checksum, sizeBytes, fileCount, status, createdAt }` — immutable.
- **`AuthToken`** `{ id, userId, kind (verify | reset), tokenHash @unique, expiresAt,
  usedAt }` — single-use, hashed at rest, expiring.
- **`LoginAttempt`** `{ key (email+ip bucket), count, windowStart, lockedUntil }` behind
  `lib/rate-limit.ts` (interface `RateLimiter` so a Redis/Upstash impl can swap in).

Migrations are hand-written SQL against `prisma/schema.prisma`; they are never edited
after shipping; `prisma migrate deploy` is run by the operator, not by CI or agents.

## Auth

NextAuth v4 Credentials provider (kept — audited, honest-error, DB-fresh guards) + custom
pages. Flows: signup (creates `User`, starts verification email), email verification,
login (rate-limited, timing-equalized via dummy bcrypt compare, no enumeration), logout,
forgot/reset password (single-use hashed tokens), change password (session + current
password), account settings incl. "Become a developer". Test credentials exist only in
the dev seed; none appear in UI or README.

## Sandbox reality (agents: read before trusting your own typecheck)

This repo's development sandbox cannot download Prisma engines or browsers. Consequently:
- `node_modules/@prisma/client` may be an any-typed stub generated by
  `scripts/stub-prisma-types.js` + `scripts/patch-stub-client.js` (re-run both after any
  `npm i`). Local `tsc` catches model typos and delegate-union errors but NOT argument
  shapes — hand-audit every Prisma call site against `prisma/schema.prisma` before push;
  only the real codegen (Vercel build) catches the rest. Known trap: nullable `Json`
  columns take `Prisma.DbNull` or omitted fields, never JS `null`.
- Playwright browsers and a Postgres database are unavailable here. `npm run verify`
  runs everything runnable and prints SKIPPED (not passed) for anything that needs a
  browser/DB, with the exact reason. Never mark skipped as green.

## Deploy

Vercel (build = `prisma generate` + `next build`; never change the build command).
Required env: `DATABASE_URL`, `APP_HOST`, `SITES_DOMAIN`, `NEXTAUTH_SECRET`,
`CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, payment + email vars per provider
(see `lib/env.ts` for the authoritative list). Cron jobs hit `/api/cron/*` with the
`CRON_SECRET` bearer. Migrations: `npx prisma migrate deploy` by the operator.
