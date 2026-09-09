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
✅ vercel.json for deployment readiness  

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

## What's Next (Phase 1)

- Real theme templates/rendering logic
- Payment integration (Paystack or other)
- Usage tracking and 70/30 revenue split
- Custom domain verification flow
- UI polish and responsive design
- Developer onboarding flow

## Out of Scope for Phase 0

- Payment processing
- Real theme templates (only placeholder UI)
- 70/30 revenue split logic
- FUP/usage tracking
- WhatsApp catalog import
- Custom domain verification logic
- UI polish (ugly is fine for Phase 0)
- Marketing pages beyond basic landing