-- Phase 1: business site fields, subscription tracking, onboarding sessions.
-- Hand-written to match prisma/schema.prisma exactly.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "nextBillingDate" TIMESTAMP(3),
ADD COLUMN     "paystackCustomerCode" TEXT,
ADD COLUMN     "paystackSubscriptionCode" TEXT,
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive';

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "payload" JSONB NOT NULL,
    "paystackTxId" TEXT,
    "businessId" TEXT,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_reference_key" ON "OnboardingSession"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_businessId_key" ON "OnboardingSession"("businessId");

-- CreateIndex
CREATE INDEX "OnboardingSession_userId_idx" ON "OnboardingSession"("userId");

-- CreateIndex
CREATE INDEX "OnboardingSession_status_createdAt_idx" ON "OnboardingSession"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Theme.price must be a real price before it feeds payment calculations.
-- Prisma has no CHECK-constraint DSL; this is applied here and re-stated in
-- schema.prisma comments so future migrations carry it forward. (Note: a
-- later `prisma migrate dev` will NOT drop this — drift detection only
-- reports unapplied schema changes, and CHECKs live outside the datamodel.
-- If a future shadow-DB diff ever tries to remove it, re-add it.)
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_price_positive" CHECK ("price" > 0);
