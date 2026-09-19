
## Phase 2 — usage, overage, custom domains, payout ledger

**Usage & overage.** One `UsageRecord` per business per billing period
(`[nextBillingDate − 30d, nextBillingDate)`), upserted daily by
`/api/cron/usage-snapshot` (06:55 UTC, five minutes before the renewal
cron, so a bill that goes out today prices against this morning's
snapshot). Per-field sources, and what is live today:
  • `blobStorageGb` — EXACT always: Blob SDK `listAll` over the owner's
    `logos/<userId>/` prefix (decimal GB). Overage on this is live from
    day one.
  • `bandwidthGb` — Vercel Analytics `daily-usage` when
    `VERCEL_ACCESS_TOKEN`+`VERCEL_PROJECT_ID` are set (Pro-plan endpoint)
    AND Vercel reports the business's host as its own domain entry.
    Unset/plan-limited/host-not-reported → the previous value is KEPT,
    never zeroed: bandwidth overage is DORMANT (₦0), not estimated.
  • `blobTransferGb` — no per-business platform source exists; the value
    is operator-seeded (`UPDATE "UsageRecord" SET "blobTransferGb" = 40 …`)
    and likewise kept, never guessed.
Every cron log line states `source` per field; the day you upgrade to
Pro is the auditable point numbers flip to `[api]`.
**Unit-check on first real run:** the parser assumes `dataTransferred` is
BYTES (÷1e9 → GB) — on the first Analytics-powered snapshot, compare one
business against Vercel's Usage dashboard; the single conversion constant
is in `lib/vercel/analytics.ts`.
FUP (final model, in `lib/billing/overage.ts`): 6 GB bandwidth / 5 MB
storage / 2 GB transfer included; ₦500/₦100/₦200 per GB over. Reference
test: e-commerce profile (10 GB, 0.146 GB, 40 GB) → ₦2,000 + ~₦14 +
₦7,600 = **₦9,614** (`npm run test:phase2`). Renewal PendingPayments store
`baseKobo`/`overageKobo`/`overageDetail` — both the reminder email and
/admin/payments show the itemization, never a bare lump sum.

**Custom domains.** Owners enter a domain on the dashboard → normalized +
validated (`lib/domains.ts`), claimed `@unique` across businesses, and
(best-effort) attached to the Vercel project. `domainStatus` becomes
`verified` ONLY from Vercel's project-domain record (DNS + TLS — never
inferred from our own DNS lookups). Verified flips two things at once:
the middleware routes the host to `/tenant-host` (production only; dev
and preview behavior unchanged) and the Agora subdomain 308s to the
custom domain so content is never duplicated. DNS guidance shown to
owners is the copy-approved plain-language block in
`components/domain-panel.tsx` — treat wording changes as copy reviews.

**Dev payouts.** Monthly cron `/api/cron/dev-payouts` (06:00 UTC on the
1st) computes, per dev: Σ floor(0.7 × theme price) over payments
CONFIRMED in the previous calendar month — the ₦5,000 hosting fee and all
overage stay platform revenue (settled split policy). Price comes from the
payment row (`baseKobo − fee`), so a mid-month reprice can't rewrite
history; rows without `baseKobo` (pre-Phase-2 confirmations) are counted
in `skippedNoBase` and deliberately not backfilled — the ledger starts at
Phase 2. `owed` rows self-heal on re-runs; `paid` rows are immutable, and
marking paid lives at `/admin/payouts` (same manual-confirm trust model).
Known gap: if `PAYMENT_PROVIDER=paystack` is ever enabled, its webhook
fulfillment mints no `PendingPayment` ledger row yet — payouts would
undercount; wire a confirmed-row insert into `fulfillPaidSession` before
switching over.

**Testing heavy-usage acceptance by hand:** `UPDATE "UsageRecord" SET
"bandwidthGb"=10,"blobStorageGb"=0.146,"blobTransferGb"=40, "overageKobo"=961410 WHERE "businessId"='…';`
then run the renewal cron — the payment row + email carry the three
itemized lines (or set the usage numbers and let the snapshot cron recompute).

# Agora - Multi-Tenant SaaS Platform (Phase 0)

A technical skeleton for a multi-tenant SaaS platform where small businesses subscribe to website "themes" built by developers. Phase 0 focuses on the technical foundation only.

## Features Implemented

✅ Next.js 15+ App Router with TypeScript  
✅ Tailwind CSS styling  
✅ Prisma ORM with PostgreSQL schema  
✅ NextAuth.js Credentials provider (email/password)  
✅ Subdomain routing middleware  
✅ /sites/[subdomain] dynamic route  
✅ Prisma seed with demo data  
✅ Protected route groups (/dashboard, /dev)  
✅ Vercel Blob upload smoke test  
✅ Business onboarding flow (subdomain → profile → live preview → Paystack payment)  
✅ Paystack subscriptions (test mode): webhook-verified activation, past_due grace handling  
✅ "Minimal" theme rendering real business profiles on tenant subdomains  

## Getting Started

### 1. Install dependencies

```bash
cd /home/titan/agora
npm install
```

### 2. Set up environment variables

Copy the example file and edit as needed:

```bash
cp .env.example .env
```

Update these values with your actual credentials:

- `DATABASE_URL`: PostgreSQL connection string (works with Neon)
- `NEXTAUTH_SECRET`: Generate a 32-character secret (e.g. `openssl rand -base64 32`)
- `NEXTAUTH_URL`: `http://localhost:3000` for local development
- `ROOT_DOMAIN`: `agora.test` for local testing
- `PAYSTACK_SECRET_KEY`: your Paystack **test** secret key (`sk_test_…`) from the Paystack dashboard — required for onboarding payments; production builds fail without it

### 3. Generate Prisma client

```bash
npx prisma generate
```

### 4. Run the development server

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 5. Local subdomain testing

Phase 0 requires simulating subdomains locally since real wildcard DNS only works in production. Here's how:

1. Add this to your `/etc/hosts` file:
   ```
   127.0.0.1 demo.agora.test
   127.0.0.1 www.agora.test
   127.0.0.1 agora.test
   ```

2. Restart your dev server if it's running

3. Access your app at:
   - `http://demo.agora.test` → routes to `/sites/demo` and shows "Demo Boutique" name
   - `http://www.agora.test` → routes to root marketing pages
   - `http://agora.test` → routes to root marketing pages

### 6. Database setup

```bash
# Create database (if needed)
npx prisma migrate dev --name init

# Reset database and seed demo data
npm run db:reset
```

### 7. Protected routes

- **Business owner dashboard**: `/dashboard` (requires role: "business_owner" or "admin")
- **Developer portal**: `/dev` (requires role: "developer" or "admin")
- **Sign in**: Use test accounts:
  - `dev@agora.test` / `password123` (developer role)
  - `owner@agora.test` / `password123` (business_owner role)

## Deployment to Vercel

### 1. Create a Vercel project

- Import this repository or create a new project from GitHub
- Deploy. Vercel generates a default domain like `your-project.vercel.app`.
- Set these environment variables in Vercel:
  - `DATABASE_URL` (your PostgreSQL connection string)
  - `NEXTAUTH_SECRET` (32+ character secret)
  - `NEXTAUTH_URL` (e.g., `https://your-project.vercel.app`)
  - `ROOT_DOMAIN` (e.g., `your-project.vercel.app`)
  - `BLOB_READ_WRITE_TOKEN` (get this from Vercel Blob dashboard)
  - `PAYMENT_PROVIDER` — `manual` (default/active) or `paystack`
  - `MANUAL_BANK_NAME` / `MANUAL_BANK_ACCOUNT_NAME` / `MANUAL_BANK_ACCOUNT_NUMBER` — your real receiving account (required in production while `manual` is active)
  - `CRON_SECRET` — required in production (payment crons are enabled in `vercel.json`)
  - `PAYSTACK_SECRET_KEY` — only required when `PAYMENT_PROVIDER=paystack`
  - `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — optional; renewal reminders log until set

### 2. ⚠️ Important: subdomains on `.vercel.app`

Vercel's default `.vercel.app` domain **does not support wildcard tenant subdomains** — it is on the Public Suffix List, and Vercel only issues wildcard SSL certificates for custom domains pointed at Vercel nameservers. So `fashionbrand.your-project.vercel.app` will **not** resolve to your project.

**Workaround for now:** use plain path-based URLs. They work immediately with zero config:

- `https://your-project.vercel.app/sites/demo` → renders the "Demo Boutique" business
- `https://your-project.vercel.app/sites/fashionbrand` → renders that business
- `https://your-project.vercel.app/` → marketing page

The `/sites/[subdomain]` route and its data flow are identical to what the subdomain rewrite will serve. The `middleware.ts` rewrite logic is already in place and will activate automatically once you add a real wildcard domain.

### 3. When you buy a real domain later

Add the apex domain and a wildcard subdomain in the Vercel dashboard (requires Vercel nameservers `ns1.vercel-dns.com` / `ns2.vercel-dns.com`):

- Apex: `agora.com`
- Wildcard: `*.agora.com`

Then `https://fashionbrand.agora.com` → routes to `/sites/fashionbrand` page, and `https://www.agora.com` → routes to root marketing pages. No code change needed — just set `ROOT_DOMAIN=agora.com`.

### 4. Local verification steps

Since real wildcard DNS only works once deployed, you'll need to simulate subdomains locally:

1. **Edit `/etc/hosts`** (requires sudo):
   ```
   127.0.0.1 demo.agora.test
   127.0.0.1 fashionbrand.agora.test
   127.0.0.1 www.agora.test
   127.0.0.1 agora.test
   ```

2. **Start dev server**:
   ```bash
   npm run dev
   ```

3. **Test URLs**:
   - `http://demo.agora.test` → should show "Demo Boutique" name
   - `http://fashionbrand.agora.test` → should show "Fashion Brand" name (if seeded)
   - `http://www.agora.test` → should show Agora marketing page

## Phase 1: Onboarding & Paystack Payments

**The loop:** `/onboard` (business_owner only) → 4 steps: subdomain (live-validated against `lib/tenant.ts` rules + DB uniqueness), profile (name/description/contacts/logo/color), live preview of the real Minimal theme, then payment. **No `Business` row exists until a verified payment fulfills the session** — abandoning onboarding never squats a subdomain.

**Money rules (all server-side, never client-supplied):**
- Amount = `theme.price + 500000` kobo (₦5,000 flat hosting fee), computed from the DB at `POST /api/onboarding/payment-init`; `Theme.price > 0` is enforced by both `chargeAmountKobo()` and a DB CHECK constraint.
- Checkout runs against Paystack **Plans** (monthly interval), so renewals are handled by Paystack itself.
- `POST /api/webhooks/paystack` accepts **only** requests whose `x-paystack-signature` (HMAC-SHA512 over the exact raw body, keyed by your secret) verifies; everything else is 401'd before parsing.
- `charge.success` does not create anything directly — it triggers `fulfillPaidSession(reference)`, which **re-verifies the transaction via the Paystack API**, reconciles the charged amount against the invoice amount, then creates the Business (`subscriptionStatus: "active"`, `nextBillingDate` +30d) exactly once (single-flight claim on the session; safe against duplicate/replayed webhooks).
- `invoice.payment_failed` / `subscription.disable` → `past_due`; site stays live (grace). Renewal events flip back to `active` and bump `nextBillingDate`.
- The post-payment return page (`/onboard/callback?reference=…`) calls `/api/onboarding/confirm`, which runs the same idempotent verification — so onboarding completes even if the webhook is slow, and never on a forged redirect.

**Testing with test mode:**
1. Set `PAYSTACK_SECRET_KEY=sk_test_…` (Paystack dashboard → Settings → API keys). Use Paystack's published test cards from their docs — never in this repo.
2. Local webhooks: run `npx paystack listen <your-public-url>` (Paystack CLI) or point a tunnel at your dev server, then set the webhook URL in the dashboard to `<public-url>/api/webhooks/paystack` with events: `charge.success`, `invoice.payment_failed`, `subscription.disable`, `subscription.renew`.
3. Or skip webhooks entirely during manual testing — the confirm route self-verifies on return.

**Acceptance checklist:** see the "Verify it yourself" flow: onboard with a test card → business appears at `<sub>.agora.test` (or `/sites/<sub>`) → dashboard shows Active + renew date → simulate `invoice.payment_failed` via the Paystack dashboard's event sender → banner appears, site stays live → `/dev` shows the subscriber row.

## Phase 1.5: Manual payments (active) + provider switch

Money now flows through **one interface, two interchangeable providers**
(`PAYMENT_PROVIDER` env, default `manual`):

- **`manual` (ACTIVE):** onboarding's last step shows **bank transfer
  instructions** — real account details from env vars, an exact amount
  (`theme.price + ₦5,000` hosting fee), and a copy-able collision-checked
  reference `AGORA-XXXXXX` (unambiguous alphabet: no `O/0/I/1/L`). The owner
  taps "I've made the transfer" (informational only). **No Business row
  exists yet** — the validated draft + a `PendingPayment` record wait for you.
  You check your bank statement, then click **Confirm** at `/admin/payments`
  → business created, `active`, `nextBillingDate` +30d, subdomain live
  instantly. Not matching? **Reject** with a reason (releases the subdomain
  hold immediately). This click is the one human step; everything around it
  is automatic.
- **`paystack` (kept intact, unused for now):** the entire Phase 1 path —
  hosted checkout, verified webhook, API re-verification, amount
  reconciliation, `/onboard/callback` confirm — just sits behind the switch.
  `/admin/payments` lists nothing because the Paystack path never creates
  `PendingPayment` rows.

**Renewals (semi-automatic):** Vercel Crons (`vercel.json`, UTC — 07:00 ≈
08:00 WAT) run daily:
`/api/cron/renewal-reminders` mints a fresh reference + `PendingPayment`
(kind=`renewal`) for businesses due within 3 days and emails bank details to
the owner (Resend if configured, otherwise clearly logged — never blocks);
`/api/cron/past-due-sweep` flips businesses 5+ days overdue to `past_due` —
**the site keeps rendering**; the dashboard shows a calm note, and suspension
is a later decision. You confirm renewals in the same `/admin/payments` panel.
Cron endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel adds it
automatically when the env var is set).

**Migrating to Paystack later = set `PAYMENT_PROVIDER=paystack`** (+
`PAYSTACK_SECRET_KEY`). Nothing else changes: the switch is read in one place
(`getActiveProvider()`), the onboarding UI branches on the returned
`instructions.type`, and both providers converge on the same
`createBusinessFromDraft()` — one code path from validated draft to live
Business, whatever triggered it.

**Admin access:** the `admin` role already existed in the enum; the seed now
creates `admin@agora.test` (dev only, same guarded seed file) — `/admin/payments`
is role-gated server-side (`requireRole(["admin"])`), and the confirm/reject
APIs re-check role + same-origin on every call.

## What's Next (Phase 2)

- Usage tracking and 70/30 revenue split automation (dev payout transfers)
- Multi-theme store + developer theme publishing UI
- Custom domain verification flow
- Suspension workflow after extended `past_due`
- UI polish and responsive design

## Out of Scope for Phase 0

- Payment processing
- Real theme templates (only placeholder UI)
- 70/30 revenue split logic
- FUP/usage tracking
- WhatsApp catalog import
- Custom domain verification logic
- UI polish (ugly is fine for Phase 0)
- Marketing pages beyond basic landing