-- Phase 0: accounts (roles gone, tokens, login limiter) + template engine
-- (slug/status on Theme, immutable ThemeVersion, DeveloperProfile ledger key).
-- Hand-written to match prisma/schema.prisma; every backfill keeps data.

-- ── enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "ThemeStatus" AS ENUM ('draft', 'in_review', 'published', 'rejected', 'unlisted');
CREATE TYPE "AuthTokenKind" AS ENUM ('verify', 'reset');

-- ── new tables ────────────────────────────────────────────────────────────
CREATE TABLE "DeveloperProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeveloperProfile_accountNumber_digits_check" CHECK ("accountNumber" IS NULL OR "accountNumber" ~ '^[0-9]{10}$')
);

CREATE TABLE "ThemeVersion" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AuthTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "DeveloperProfile_userId_key" ON "DeveloperProfile"("userId");
CREATE INDEX "DeveloperProfile_userId_idx" ON "DeveloperProfile"("userId");
CREATE UNIQUE INDEX "ThemeVersion_checksum_key" ON "ThemeVersion"("checksum");
CREATE UNIQUE INDEX "ThemeVersion_themeId_version_key" ON "ThemeVersion"("themeId", "version");
CREATE INDEX "ThemeVersion_themeId_idx" ON "ThemeVersion"("themeId");
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_kind_idx" ON "AuthToken"("userId", "kind");

-- ── User: role column -> capability columns, backfilled ──────────────────
ALTER TABLE "User" ADD COLUMN "isStaff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

UPDATE "User" SET "isStaff" = true WHERE "role" = 'admin';
-- grandfather: every pre-Phase-0 account has had its email all along
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

-- DeveloperProfile rows for: everyone the old model called developer, anyone
-- who owns a Theme, and anyone with payouts — the ledger must not orphan.
INSERT INTO "DeveloperProfile" ("id", "userId", "displayName", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", u."email", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE (u."role" = 'developer'
   OR EXISTS (SELECT 1 FROM "Theme" t WHERE t."devId" = u."id")
   OR EXISTS (SELECT 1 FROM "DevPayout" dp WHERE dp."devId" = u."id"))
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_role_fkey";
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "Role";
DROP INDEX IF EXISTS "User_role_idx";

-- ── Theme: slug/status/description + version pointer; devId -> developerId ─
ALTER TABLE "Theme" ADD COLUMN "slug" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" "ThemeStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "currentVersionId" TEXT,
  ADD COLUMN "developerId" TEXT;

-- slug comes from the old templateKey (identical namespace); duplicates
-- (multiple devs shipping the same key) get a deterministic suffix so the
-- unique index can exist at all — those rows stay visible with their own id.
WITH ranked AS (
  SELECT "id", "templateKey", row_number() OVER (PARTITION BY "templateKey" ORDER BY "createdAt" ASC, "id" ASC) rn
  FROM "Theme"
)
UPDATE "Theme" t
SET "slug" = CASE WHEN r.rn = 1 THEN r."templateKey" ELSE r."templateKey" || '-' || substr(md5(t."id"), 1, 6) END,
    "status" = 'published' -- every pre-existing row was live for tenants
FROM ranked r WHERE r."id" = t."id";

UPDATE "Theme" t SET "developerId" = dp."id"
FROM "DeveloperProfile" dp WHERE dp."userId" = t."devId";

-- Any row whose dev user no longer has a profile (should be impossible:
-- the old RESTRICT FK kept owners alive) is pinned to the oldest profile so
-- the migration can never silently strand a theme; NOT NULL applies after.
UPDATE "Theme" SET "developerId" = (SELECT "id" FROM "DeveloperProfile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "developerId" IS NULL;
ALTER TABLE "Theme" ALTER COLUMN "slug" SET NOT NULL, ALTER COLUMN "developerId" SET NOT NULL;
ALTER TABLE "Theme" DROP CONSTRAINT IF EXISTS "Theme_devId_fkey";
ALTER TABLE "Theme" DROP COLUMN "devId";
ALTER TABLE "Theme" DROP COLUMN "templateKey";
DROP INDEX IF EXISTS "Theme_devId_idx";
DROP INDEX IF EXISTS "Theme_templateKey_idx";

CREATE UNIQUE INDEX "Theme_slug_key" ON "Theme"("slug");
CREATE INDEX "Theme_status_idx" ON "Theme"("status");
CREATE UNIQUE INDEX "Theme_currentVersionId_key" ON "Theme"("currentVersionId");
CREATE INDEX "Theme_developerId_idx" ON "Theme"("developerId");

ALTER TABLE "Theme" ADD CONSTRAINT "Theme_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ThemeVersion" ADD CONSTRAINT "ThemeVersion_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ThemeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DevPayout: devId now keys DeveloperProfile, not User ─────────────────
UPDATE "DevPayout" dp SET "devId" = prof."id"
FROM "DeveloperProfile" prof WHERE prof."userId" = dp."devId";
ALTER TABLE "DevPayout" DROP CONSTRAINT IF EXISTS "DevPayout_devId_fkey";
ALTER TABLE "DevPayout" ADD CONSTRAINT "DevPayout_devId_fkey" FOREIGN KEY ("devId") REFERENCES "DeveloperProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
