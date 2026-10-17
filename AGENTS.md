# AGENTS.md — working in this repo

Read first: `docs/ARCHITECTURE.md` (system shape + sandbox caveats), then the doc for
what you're touching (`TEMPLATE_SPEC.md` / `PLUGIN_SPEC.md` / `DESIGN.md` /
`TEMPLATE_AUTHORING_RULES.md`). Keep docs true as you build — a stale doc is a bug.

## Non-negotiables

- Multi-tenant security invariants: routing lives only in `middleware.ts`+`lib/tenant.ts`;
  app routes never serve on `SITES_DOMAIN`, tenant hosts never serve app; session cookie
  host-only; reserved subdomains include `preview`; production host allowlist keeps the
  Vercel-preview exemption. Update `host classification` unit tests with ANY change here.
- Authorization: `businessId` from the session's owner, never the client; every row op is
  `where: { id, businessId }`; mutations check same-origin + auth session + ownership;
  capabilities (`isStaff`, developer profile) re-read from DB on guarded renders.
- No `dangerouslySetInnerHTML`; no HTML/CSS/JS from the database rendered raw; template
  sandbox rules in `docs/TEMPLATE_SPEC.md` are enforced by engine+validator, not by trust.
- All env access via `lib/env.ts`. No secrets in code/logs/commits; never print password
  or token hashes. Explicit `select` on any `User` query — never `include`.
- Migrations: hand-written SQL, reconciled against `schema.prisma` by reading BOTH;
  never edit a shipped migration; never automate `prisma migrate deploy` (operator runs it).
- Don't change the build command. Payment paths (manual + Paystack) must keep working.
- Verification is the agent's job: `npm run verify` must pass before any "done" claim, and
  anything the environment can't run must be reported as SKIPPED with its reason — never
  silently assumed green.

## Sandbox caveats (this environment, not production)

- Prisma engines and browsers can't be downloaded here. `@prisma/client` is an
  any-typed stub: re-run `node scripts/stub-prisma-types.js && node scripts/patch-stub-client.js`
  after any `npm i`. The stub models model names/typos and delegate-union errors but NOT
  query-arg shapes — hand-audit Prisma call sites against `prisma/schema.prisma`. Real
  codegen typing is checked by the Vercel build; past outages there were nullable-`Json`
  writes (use `Prisma.DbNull`, never JS `null`) and un-narrowed cross-model delegate
  unions. Do not repeat those.
- No database here: integration/e2e parts of `npm run verify` are written to run and are
  reported SKIPPED in-sandbox; they must pass on a machine with `DATABASE_URL` + browsers.

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm test` (unit, no DB needed) ·
`npm run theme:validate <dir>` · `npm run verify` (full: tsc+lint+unit+integration+e2e+
theme validation+build, one pass/fail summary; skipped items are printed).
Seed (`npm run prisma:seed`) is dev-only and contains no production credentials.

## Layout map

`app/` routes · `components/ui/` design-system primitives · `lib/` server services ·
`core/agora-engine/` pure template engine (no next/prisma/react imports — unit-enforced) ·
`themes-packages/` first-party template packages (the only place a template's source lives) ·
`prisma/` schema + migrations + dev seed · `scripts/` verification/unit harnesses.
