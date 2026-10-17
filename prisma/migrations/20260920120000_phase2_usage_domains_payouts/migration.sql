-- Phase 2: usage records, custom-domain state, renewal itemization, dev payout ledger.
-- Written by hand from schema.prisma (sandbox cannot reach the Prisma migration
-- engine); every column/index/constraint below is cross-checked against the
-- models it mirrors — including the ones that bit us in 20260915090000 (a
-- CREATE TABLE missing a column the schema had).

-- CreateTable: UsageRecord (model UsageRecord)
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "bandwidthGb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blobStorageGb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blobTransferGb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overageKobo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DevPayout (model DevPayout)
CREATE TABLE "DevPayout" (
    "id" TEXT NOT NULL,
    "devId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'owed',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,

    CONSTRAINT "DevPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (names exactly as Prisma generates them)
CREATE INDEX "UsageRecord_businessId_periodStart_idx" ON "UsageRecord"("businessId", "periodStart");

CREATE INDEX "DevPayout_devId_status_idx" ON "DevPayout"("devId", "status");

-- AddForeignKey: required relation => Restrict on delete (a Business with
-- usage history cannot be deleted underneath it; there is no business-delete
-- path in the app — this only guards manual DB surgery)
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: DevPayout
ALTER TABLE "DevPayout" ADD CONSTRAINT "DevPayout_devId_fkey" FOREIGN KEY ("devId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevPayout" ADD CONSTRAINT "DevPayout_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: PendingPayment renewal itemization + confirmation timestamp
-- (all nullable: existing rows — confirmed signups — are untouched semantics)
ALTER TABLE "PendingPayment" ADD COLUMN "baseKobo" INTEGER;
ALTER TABLE "PendingPayment" ADD COLUMN "overageKobo" INTEGER;
ALTER TABLE "PendingPayment" ADD COLUMN "overageDetail" JSONB;
ALTER TABLE "PendingPayment" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- AlterTable: Business custom-domain state (customDomain itself + its @unique
-- index have existed since Phase 0 — nothing to add there)
ALTER TABLE "Business" ADD COLUMN "domainStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Business" ADD COLUMN "domainError" TEXT;
ALTER TABLE "Business" ADD COLUMN "domainCheckedAt" TIMESTAMP(3);

-- Backfill note (NOT executed here, deliberate): existing confirmed payments
-- have confirmedAt = null, so they fall outside every DevPayout window.
-- History is ledger-starts-at-Phase-2 by design; backfilling would mean
-- inventing confirmation times (updatedAt is NOT "when it was confirmed").
-- If a real need ever arises, backfill with an auditable one-off SQL, not a
-- silent migration step.
