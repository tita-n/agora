# Agora Phase 0 — Security & Architecture Audit

Date: 2026-09-12. Audited at commit `5a4d74e`, branch `master` (all 33 tracked files read).

**Verification performed** (so findings below are tested, not assumed):
- `tsc --noEmit` → passes. `next build` → app compiles; build's ESLint step crashes (see C-6) and the build ignores the crash.
- Reproduced the middleware `getSubdomain()` logic against adversarial inputs (suffix-concatenation hosts, nested subdomains, ports, uppercase, encoded slashes, trailing-dot FQDN).
- Inspected installed library internals in `node_modules` to confirm behavior: `next-auth@4.24.15` (`core/lib/assert.js`, `jwt/index.js`, cookie defaults), `@vercel/blob@2.8.0` (`handleUpload` signature, token constraint options), `eslint-config-next@15.5.25` / `@rushstack/eslint-patch`.
- Grepped the entire git history for committed secrets. None found (only placeholders in `.env.example` and dev-only seed passwords).

Severity: **CRITICAL** (fix before anything else) > **HIGH** (fix now, cheap) > **MEDIUM** (fix in Phase 1) > **LOW** (polish/footnote).

---

## 1. Multi-tenancy

### Verdicts on the specific questions

- **Is subdomain extraction safe?** Mostly yes, with two gaps. `getSubdomain()` correctly strips ports, lowercases, requires a literal `.` before the root domain (so `evilagora.test` does NOT match `agora.test`), rejects nested subdomains, and treats apex/`www` as the main app. It reads only the `Host` header — never `X-Forwarded-Host` — which is the correct trust anchor (the browser cannot forge `Host`; spoofing it requires a misconfigured proxy). Gaps: no charset validation of the extracted label (Finding M-1), and unknown hosts fall through to the main app instead of being rejected (Finding M-2).
- **Can one business's data leak into another business's page?** **No cross-tenant leak exists today.** The only tenant query is `findUnique({ where: { subdomain } })` against a `@unique` column; the subdomain comes from the middleware-validated rewrite or the URL path — never a client JSON/body input; no shared mutable state (the dev-cached Prisma singleton is stateless); no `id`-based tenant lookup anywhere. However there is a **leak-adjacent landmine** (Finding H-1: `include: { owner: true }` pulls the owner's password hash into every tenant page render) and a **cache-key trap** to encode as a rule now (Finding M-3).

### M-1 — Middleware does not whitelist the tenant label; unvalidated rewrite target
**Wrong:** `sub` is only checked non-empty and dot-free. Verified: `Host: foo%2fbar.agora.test` yields subdomain `foo%2fbar` and rewrites to `/sites/foo%2fbar`, which decodes into an extra path segment. Today this lands on a 404, but it's an unvalidated string flowing into `url.pathname`. Also, the rewrite replaces the *entire* path: `evil.agora.test/anything` → `/sites/evil`, so tenant hosts can never expose other routes (login, future per-tenant paths) without reworking this.
**Why it matters:** defense-in-depth at the tenancy boundary; the path-swallowing shape will surprise you the first time a tenant page needs its own sub-routes.
**Fix:** validate and route explicitly in `middleware.ts`:
```ts
const SUB_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = new Set(["www","api","app","admin","login","logout","dashboard","dev","assets","static","cdn","mail","status","support","help","root","docs"]);
// after computing sub:
if (!SUB_RE.test(sub) || RESERVED.has(sub)) {
  return new NextResponse("Not found", { status: 404 }); // reject, don't fall through
}
const url = req.nextUrl.clone();
url.pathname = `/sites/${sub}${url.pathname === "/" ? "" : url.pathname}`; // preserve sub-paths
```

### M-2 — Unknown/unattached hosts render the whole main app; no host allowlist
**Wrong:** if `getSubdomain` returns null for a foreign host (e.g., someone CNAMEs `agora.phishing.example` at the deployment, or hits the raw `*.vercel.app` URL), the middleware lets the request through and the full app serves at that host — including `/login`, which POSTs to the same origin. Vercel's default domain checks mitigate this (unattached domains get a Vercel-branded error), but "mitigated by platform default" is not an app-level guarantee, and self-hosting (`npm start`) later would remove that safety net.
**Why it matters:** phishing mirror with your real login form; session cookies are host-scoped so creds don't ride along, but the UX of "the app runs at the wrong domain" invites mistakes in the custom-domain feature you're planning.
**Fix:** in production mode, treat `ROOT_DOMAIN`/`www.ROOT_DOMAIN`/`localhost` (dev) as the *only* non-tenant hosts the middleware serves; everything else that doesn't resolve to a known tenant → 404/`NextResponse.rewrite("/sites/…")`/`redirect` to apex per your product choice. Add: `if (process.env.NODE_ENV === "production" && !hostname.endsWith(root)) return new NextResponse(null, { status: 404 })`. Also enable Vercel's "Attack Challenge Mode"/domain verification for the wildcard.

### M-3 — Tenant pages must stay request-scoped once caching enters the picture
**Not a bug yet:** `/sites/[subdomain]` is dynamic and keyed by `params`, which is correct. The trap: the *same* route path is reached from many hosts (rewrite), and also directly by path on the main domain (intentional per README). The moment anyone adds `export const revalidate`, `unstable_cache`, or full-route caching without including the subdomain in the cache key, one tenant's page can be served to another's visitors.
**Fix:** write the rule into `app/sites/[subdomain]/page.tsx` docblock now; any future caching helper for tenant data must take the subdomain as part of its key (e.g. `unstable_cache(fetcher, [subdomain], …)`).

### M-4 — Sessions are host-only cookies; they will not work on tenant subdomains
**Wrong (by design today, a trap tomorrow):** NextAuth v4 sets `next-auth.session-token` (or `__Secure-` prefixed under https/`VERCEL` — verified in `core/lib/cookie.js` and `utils/get-token.js` semantics) with no `domain` attribute → host-only. Login at `agora.com` creates a session `demo.agora.com` never sees. Fine while tenant pages are public; broken the first time an owner previews their own site.
**Fix (Phase 1):** set `cookies: { sessionToken: { name: ..., options: { domain: `.${process.env.ROOT_DOMAIN}`, sameSite: "lax" } } }` in auth options — and note this also makes the session valid on *every* subdomain, which is why the cookie→tenant authorization check must always be the DB role/membership, never "which host am I on".

---

## 2. Auth & sessions

### Verdicts on the specific questions

- **Password hashing:** ✅ Correct. `bcryptjs`, cost factor 12 (seed + intended login path), hash-only in DB, no plaintext logged anywhere (audited all `console.*` and Prisma dev query logs — dev `log: ["query","error","warn"]` in `lib/prisma.ts` prints SQL *params*; login queries by email and never sends the password to Prisma). Caveat L-1 (bcrypt 72-byte truncation) for the future signup flow.
- **Role from client?** ✅ No. `authorize` reads `user.role` from the DB row; `jwt` copies it to the token only at sign-in from the trusted provider result; `session` copies token→session; nothing in the app reads `role` from request input for an authz decision (`after-login` reads the *server* session). Client-supplied role injection is not possible with this structure. The real problem is the opposite direction: **staleness** (H-2).
- **Are `/dashboard` and `/dev` guarded server-side?** ✅ Yes, genuinely. `requireRole` runs inside the Server Component and calls `redirect()` before any data fetch; a logged-out `curl` to `/dashboard` gets a 3xx to `/login`, not content; a wrong-role session gets `/unauthorized`. The `useSession` client provider is present but is never used to gate anything. (Verified `force-dynamic` concern on `after-login` was fixed in 5a4d74e.)
- **Is NEXTAUTH_SECRET required/validated?** ⚠️ Partially, by the library, at request time — not by the app at startup. Verified in `next-auth@4.24.15`: `core/lib/assert.js` returns a `MissingSecret` error for auth endpoints **in production only**; `getToken` swallows decode failures and returns `null` (so a missing secret in prod = everyone permanently "logged out" with no clear error; in dev it "works" with a console warning). That is fail-closed (good) but *silent and confusing* (bad). Fix with M-5.

### H-2 — JWT role snapshot never revalidated; no revocation path
**Wrong:** `requireRole` trusts `token.role` minted at sign-in; default JWT `maxAge` in v4 is **30 days** (verified `DEFAULT_MAX_AGE` in `jwt/index.js`). A demoted, role-changed, or deleted user keeps access for up to 30 days; nothing can revoke a session.
**Why it matters:** the entire authorization model is "role from token". When payments/usage arrive, this is how ex-owners keep admin access.
**Fix (cheap now):** re-check the DB in the guard — one indexed `findUnique`, and it also covers "deleted user":
```ts
// lib/auth.ts
export async function requireRole(roles: string[]) {
  const user = await requireAuth();
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (!fresh) redirect("/login");
  if (!roles.includes(fresh.role)) redirect("/unauthorized");
  return { ...user, role: fresh.role };
}
```
Plus set `session: { strategy: "jwt", maxAge: 7 * 24 * 3600 }` and revisit with a `tokenVersion` column when you add password change.

### H-1 (also fits §3) — tenant query loads the owner's password hash server-side
See Finding H-1 in §3; listed here because it's the auth-adjacent one.

### M-5 — No startup validation of required env; NEXTAUTH_URL fallback is wrong and inconsistent
**Wrong:**
1. Nothing fails fast if `NEXTAUTH_SECRET`/`ROOT_DOMAIN`/`DATABASE_URL` are absent (see verdict above: prod fails *closed but opaquely*; dev misconfig is invisible).
2. `after-login` builds absolute redirects from `process.env.NEXTAUTH_URL || "http://localhost:3001/"` — a stale/missing `NEXTAUTH_URL` in production dumps logged-in users onto `localhost:3001`; and the fallback port (3001) contradicts `NEXTAUTH_URL=http://localhost:3000` in `.env.example` and the README, so even locally the post-login redirect breaks when the env is missing.
3. Middleware silently disables all tenancy when `ROOT_DOMAIN` is unset (defaults to `agora.test`): on `demo.agora.com` no tenant ever routes, no error, just 404s/marketing pages.
**Fix:** add `lib/env.ts` using the `zod` you already depend on, imported by everything that reads `process.env`:
```ts
import { z } from "zod";
const prod = process.env.NODE_ENV === "production";
const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be >= 32 chars"),
  ROOT_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/),
  NEXTAUTH_URL: z.string().url().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
});
const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  const msg = `Invalid/missing env: ${parsed.error.issues.map(i => `${i.path}: ${i.message}`).join("; ")}`;
  if (prod) throw new Error(msg); else console.warn("[env]", msg);
}
export const env = parsed.success ? parsed.data : (process.env as never);
```
And in `after-login`, never use `NEXTAUTH_URL` for the destination — use the request's origin:
```ts
// app/api/auth/after-login/route.ts
export async function GET(req: NextRequest) {
  ...
  return NextResponse.redirect(new URL("/dashboard", req.url)); // RelativeURL from req.url
}
```

### L-1 — Login hygiene items (fix when signup lands)
- **User enumeration via timing:** `authorize` returns `null` *before* any bcrypt work when the email doesn't exist; present-email costs ~200 ms more. Fix: `await bcrypt.compare(pw, DUMMY_HASH)` when the user is missing so both paths cost the same.
- **bcrypt silently truncates at 72 bytes:** cap password length (e.g. 128) at validation (zod) and document it.
- **No rate limiting** on `POST /api/auth/callback/credentials` — unlimited brute force. Acceptable for Phase 0; before any real users, add IP+email throttling (Upstash ratelimit or a `next-auth` event counter).
- **`as any` everywhere for role/id:** add `types/next-auth.d.ts` module augmentation so a renamed field can't silently disable authz:
```ts
declare module "next-auth" {
  interface Session { user: { id: string; role: string } & DefaultSession["user"] }
}
declare module "next-auth/jwt" { interface JWT { uid?: string; role?: string } }
```

### L-2 — `lib/auth-options.ts` instantiates a second, unused NextAuth handler
The file ends with `const handler = NextAuth(authOptions); export { handler as GET, handler as POST };` — nothing imports these (the real handler lives in `app/api/auth/[...nextauth]/route.ts`, which calls `NextAuth(authOptions)` again). Harmless today, but it means every module importing `authOptions` (both guard helpers, blob route later) drags a full route-handler instance into its bundle and instantiates the auth stack twice.
**Fix:** rename to `lib/auth-config.ts` exporting only `authOptions`; keep `NextAuth(authOptions)` only in the route file.

---

## 3. Database & Prisma

### Verified good
`subdomain` and `customDomain` are `@unique` (the index question you asked is already answered); `customDomain` nullable + unique is correct in Postgres (NULLs don't collide); FK columns `ownerId`/`devId` are indexed; `price` in integer kobo is the right call; migration SQL matches the schema.

### H-1 — `include: { owner: true }` selects the owner's `password` hash on every tenant render
**Wrong:** `app/sites/[subdomain]/page.tsx` `include`s the full `User` row (and `next/image`-adjacent future client props will push it toward serialization). Today the JSX renders only name/theme, so nothing leaks to the browser — but you're one `JSON.stringify(business)` / client-component prop / API reuse away from shipping bcrypt hashes and owner emails.
**Fix:** explicit `select`, and a shared constant:
```ts
const tenantSiteSelect = {
  name: true, subdomain: true,
  theme: { select: { name: true } },
  // owner: never include without select; add owner fields only if the template needs them
} satisfies Prisma.BusinessSelect;
await prisma.business.findUnique({ where: { subdomain }, select: tenantSiteSelect });
```
(Prisma 6 also supports per-query `omit: { owner: { select: { password: true } } }`-style omissions via `omit`; either is fine, `select` is stricter.)

### M-6 — Missing index on `Business.themeId`
Postgres does **not** auto-index FK columns (confirmed absent in the migration). Every Phase-1 feature you named hits this: "businesses using theme X" for the 70/30 split, usage tracking rollups, deprecating a theme, the developer dashboard.
**Fix:** `@@index([themeId])` on `Business`.

### M-7 — Redundant duplicate indexes (pure write cost)
`@@index([subdomain])` + `@unique`, and `@@index([email])` + `@unique` each produce **two** indexes (see `Business_subdomain_key` *and* `Business_subdomain_idx`, `User_email_key` *and* `User_email_idx` in the migration). The unique constraint already indexes the column.
**Fix:** delete both `@@index` lines and regenerate the migration (you're pre-launch: just edit + `prisma migrate dev`). `@@index([role])` on a two-value enum is also near-useless — remove or keep, your call.

### M-8 — `role: String` and no normalization on tenant/identity keys
- `role` accepts any string; `requireRole` compares with `includes` — one typo in a future signup and someone is permanently "unauthorized" or worse (a role like `"business_owner "` passes no gate but fails silently elsewhere).
- `subdomain`/`email` are case/whitespace sensitive. The middleware lowercases the host, so a business created with `Demo` is **unreachable at its own URL forever** (host `demo.agora.test` → `findUnique({subdomain:"demo"})` → 404) while still occupying the unique slot. `Owner@x.com` vs `owner@x.com` → two accounts, one login.
**Fix (schema):** `enum Role { BUSINESS_OWNER DEVELOPER ADMIN }` (update `requireRole` call sites to `Role.BUSINESS_OWNER` etc.). **Fix (app rule, when signup exists):** lowercase+trim `email`/`subdomain` before write, validate subdomain with the M-1 regex + reserved list, catch `Prisma.PrismaKnownError` P2002 and return "taken". Uniqueness is already race-safe thanks to `@unique` — keep relying on the DB constraint, not a check-then-insert.

### L-3 — Minor schema gaps
`User`/`Theme` lack `updatedAt` (`Business` has it — inconsistent). `Theme` allows duplicate names from the same dev (seed's find-then-create can race too): add `@@unique([devId, name])`. `Business.name` has no length cap (future form validation + `@db.VarChar(120)`).

---

## 4. File upload (Vercel Blob)

### Verified good
The **pattern is right**: the browser calls `upload()` from `@vercel/blob/client` against `handleUploadUrl: "/api/blob/token"`; the read-write token is never bundled to the client (no client component imports the server `@vercel/blob` entry; build proves it). Token exchange ✅.

### C-1 — `/api/blob/token` is fully unauthenticated and issues zero-constraint tokens
**Wrong, three layers deep (all verified against `@vercel/blob@2.8.0` typings):**
1. The route has **no auth check** — any anonymous internet user can POST to it and receive a signed client token for your blob store.
2. `onBeforeGenerateToken` returns `{}`. The API's returned options support `allowedContentTypes`, `maximumSizeInBytes`, `validUntil`, `addRandomSuffix`, `allowOverwrite` — **none are set**, so the token permits arbitrarily large uploads of arbitrary MIME types (default token TTL is an hour).
3. `pathname` is client-supplied and merely echoed (`_pathname`); the comment says `onBeforeGenerateToken` was gutted, and `onUploadCompleted` was removed "for Phase 0".
**Why it matters:** this is a public file-hosting service on your storage bill: crypto-miner payloads, malware, and phishing pages served from `*.public.blob.vercel-storage.com` URLs attributed to *your* store, with no record of who uploaded what. This is the single most exploitable endpoint in the app (it's also reachable from `vercel.app` URLs, not just tenant hosts).
**Fix (works as-is against the 2.8.0 API — signatures verified from `dist/client.d.ts`):**
```ts
// app/api/blob/token/route.ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const PATH_RE = /^logos\/[a-z0-9]{10,32}\/[\w.-]+\.(png|jpe?g|webp)$/i;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: HandleUploadBody;
  try { body = (await req.json()) as HandleUploadBody; }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  try {
    const data = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!PATH_RE.test(pathname) || !pathname.startsWith(`logos/${userId}/`)) {
          throw new Error("Invalid upload path");
        }
        return {
          tokenPayload: userId,
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 15 * 60 * 1000,
          callbackUrl: `${req.nextUrl.origin}/api/blob/upload-completed`,
        };
      },
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Could not issue upload token" }, { status: 403 });
  }
}
```
The client must then request `logos/${user.id}/${slug}` (the id is already exposed on the session) — the *server* enforces the prefix; `accept="image/*"` in the input is UX only and must never be counted as validation. Add a same-origin pre-check in `logo-upload.tsx` too (`file.size`, `file.type` startsWith `image/`) for fast failures.

### M-9 — Uploads are fire-and-forget: no persistence, no provenance, no cleanup
`onUploadCompleted` removed ⇒ the DB never learns the URL; the only sink is `console.log("Uploaded logo:", url)` in the browser. Files orphan on every retry, and there's no audit trail of who uploaded what — you'll want both for usage-tracking/billing and takedown requests.
**Fix:** keep the `callbackUrl` added in C-1; add `logoUrl String?` to `Business`; in `onUploadCompleted` (`(blob, tokenPayload)` available in v2.8.0), verify the payload maps to that business, store `blob.url`, and (optional, later) delete replaced blobs server-side. Remove the `console.log`.

### M-10 — `next/image` remote patterns can never match blob URLs
`next.config.ts` lists exact hostname `public.blob.vercel-storage.com`, but real blob URLs are `https://<store-prefix>.public.blob.vercel-storage.com/...`. `*.vercelusercontent.com` is not a Vercel Blob host either. The moment you render logos with `<Image>`, every remote fetch rejects → broken images on tenant sites.
**Fix:** `{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }`; drop the `vercelusercontent` entry unless something else uses it.

### L-4 — Client filename sanitization is decorative
`file.name.replace(/\s+/g,"-").toLowerCase()` does not neutralize `..`, slashes, or control chars in a client-chosen pathname. C-1's server-side `PATH_RE` makes it moot — that's the correct place; don't try to harden the sanitizer instead.

---

## 5. Environment & secrets

### Verified good
Full-git-history grep: **no committed secrets** (only `postgresql://USER:PASSWORD@HOST` placeholder and the README/seed dev credentials). `.gitignore` covers `.env*`. `.env.example` lists all five variables the code actually reads (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ROOT_DOMAIN`) — nothing missing.

### M-11 — `NODE_ENV="development"` in `.env.example`
Copying the example bakes `NODE_ENV=development` into `.env`: `next build` overrides/conflicts with it, `next start` then serves production code paths with development React semantics (error overlays, slower, different hydration), and Vercel rejects manual `NODE_ENV`. **Fix:** delete that line from `.env.example` (and never set `NODE_ENV` manually).
### L-5 — Small env-doc fixes
`NEXTAUTH_URL` fallback port 3001 vs 3000 everywhere else (see M-5 — solved by removing the fallback). Note in `.env.example` that `BLOB_READ_WRITE_TOKEN` is only needed once upload is exercised. README contains `cd /home/titan/agora` — replace with `cd .` (leaks your local layout; cosmetic).
### L-6 — README/seed production warnings
README's deploy section never says "do not run `prisma db seed` in production", and `seed.ts` **upserts** — it would reset `owner@agora.test`/`dev@agora.test` passwords to `password123` against a real DB. Fix: guard the seed: `if (process.env.NODE_ENV === "production") throw new Error("seed is dev-only")`, and use `create` + ignore-conflict semantics instead of clobbering updates.

---

## 6. Code quality & structure

### C-2 — The login page renders working test credentials to the whole world
`app/login/page.tsx` hardcodes `dev@agora.test / password123 · owner@agora.test / password123` in the UI. On any deployment where the seed ran (or a future dev DB is exposed), that's an authenticated entry into `/dashboard` and `/dev` with owner/developer privileges — combined with L-6 (seed overwrites, has no prod guard), this is your only "accidental backdoor" path.
**Fix:** remove the paragraph entirely; if you want in-app dev hints, gate it: `{process.env.NODE_ENV === "development" && <p>…</p>}` — better, put hints in the README only.

### C-6 — ESLint is silently non-functional (verified end-to-end)
`eslint.config.mjs` does `import nextLint from "eslint-config-next"; export default [...nextLint]`. Two problems: (a) `eslint-config-next@15.5.25` is an **eslintrc-style** config whose `@rushstack/eslint-patch` require crashes under modern ESLint ("Failed to patch ESLint because the calling module was not recognized" — reproduced with both `eslint@9.39.5` and `9.37.0`); (b) even if the import worked, spreading an object into an array yields nothing useful. Crucially, **`next build` prints the crash and continues**, so lint gates nothing — I restored a working config (FlatCompat or legacy `.eslintrc.json` + `next lint`) and it immediately flagged real issues (e.g. `react/no-unescaped-entities` in `app/unauthorized/page.tsx:5`).
**Fix (verified working — use one):**
```js
// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
export default [...compat.extends("next/core-web-vitals", "next/typescript")];
```
(or replace `eslint.config.mjs` with `.eslintrc.json` `{ "extends": "next/core-web-vitals" }` and keep `next lint`). Then fix the violations it surfaces, and make CI fail on lint.

### M-12 — Error handling is largely absent at exactly the seams you listed
- **DB down at login:** `prisma.user.findUnique` throwing inside `authorize` escapes into NextAuth's generic error — the form just says "Invalid email or password" (from the client's `res?.error` check) with no server-side signal distinguishing "wrong password" from "Postgres is down". Fix: `try/catch` in `authorize`: on infra error, `console.error` + return `null` (or throw a sentinel NextAuth surfaces via `?error=Server`); map the error param to a real message in `/login`.
- **DB down on tenant pages:** `prisma.business.findUnique` throws → raw 500 with no `error.tsx`/`global-error.tsx` (none exist in the repo). Fix: add `app/error.tsx` + `app/global-error.tsx` (`"use client"`, shows retry), and `app/sites/[subdomain]/not-found.tsx` for the `notFound()` branch instead of the default Next 404.
- **Blob token route:** `await request.json()` throws on malformed body (500), and `handleUpload` throws on any blob-API error (500, unhandled). Fixed in C-1's snippet.
- **Upload UX:** errors *are* surfaced (`blob-client.ts` try/catch → `{url,error}`) — the one place handled well. Keep it, add abort/timeout (`AbortSignal.timeout(60_000)` into `upload()` options' `abortSignal`).

### M-13 — `vercel.json` contains a no-op rewrite; delete it
`"source": "/((?!_next/|api/|favicon.ico$).*)" → "destination": "/$1"` rewrites every non-asset path to itself. It does nothing for subdomains (it captures no host), risks shadowing future Vercel-level routing, and misleads the next reader into thinking platform routing matters here. **Fix:** delete `vercel.json`; middleware is the routing layer.

### L-7 — Structure: fine for Phase 0, with three rules to adopt now
The skeleton won't force rework if you keep these invariants while adding payments/themes/usage:
1. **Tenant resolution stays one function** (per M-1) used by middleware *and* any future custom-domain resolution; pages/APIs receive a resolved tenant, never re-parse headers. Business-scoped data access goes through helpers that always take `{ subdomain }` (public) or `{ id: businessId }` derived *server-side* from that lookup — never a client-passed `businessId`.
2. **`lib/` is server-safe only.** `lib/blob-client.ts` is client-only code living in a server-shared folder; move it to `app/dashboard/lib/` or `components/`. Same for anything importing `@vercel/blob/client`.
3. **Use the `zod` you already ship** for signup/login/upload validation and `lib/env.ts` (M-5); delete it from `package.json` if you won't (it's currently imported nowhere — verified).
Also: the two-route auth-handler duplication (L-2), string roles (M-8), and `URL.createObjectURL` never revoked in `logo-upload.tsx` (leak, 1-line fix: revoke on re-upload/unmount).

---

## Priority order for the coding agent

1. C-1 — lock down `/api/blob/token` (auth + constraints + path validation) and C-2 — remove test credentials from the login page.
2. H-1 — replace `include` with `select`; H-2 — revalidate role in `requireRole` + `maxAge`.
3. M-5 — `lib/env.ts` fail-fast + `after-login` origin fix; M-1 — subdomain regex/reserved list.
4. M-6/M-7/M-8 — schema pass: `@@index([themeId])`, drop duplicate indexes, `Role` enum, `@@unique([devId, name])`.
5. M-9/M-10 — persistence + `remotePatterns` so upload is actually end-to-end.
6. C-6 + L-5/L-6/M-11/M-12/M-13 — lint config, README/seed hygiene, error boundaries, delete `vercel.json`.
