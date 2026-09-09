-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "SecondFactor" AS ENUM ('TOTP', 'WA_OTP');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';

-- PostgreSQL forbids referencing a value added by ALTER TYPE ... ADD VALUE
-- within the same transaction that added it ("unsafe use of new value").
-- Prisma applies this whole file as one implicit transaction, and the
-- bootstrap-promotion UPDATE at the end of this file uses 'SUPERADMIN', so
-- the addition must be committed first. Verified against this project's
-- live PostgreSQL 16.4 instance via `prisma db execute` before this
-- migration was applied for real.
COMMIT;

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecret" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- Backfill "username" in three steps instead of one NOT NULL UNIQUE
-- ADD COLUMN, which would fail against the row already seeded.

-- 1. tambahkan nullable dulu
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- 2. isi mundur dari bagian lokal email, bersihkan karakter tak sah,
--    dan selesaikan tabrakan dengan nomor urut
UPDATE "User" SET "username" = regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9._-]', '', 'g');

WITH ranked AS (
  SELECT "id", "username",
         ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt") AS rn
  FROM "User"
)
UPDATE "User" u SET "username" = u."username" || ranked.rn::text
FROM ranked WHERE u."id" = ranked."id" AND ranked.rn > 1;

-- 3. baru kunci
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- normalisasi telepon ke 62xxx; tanpa ini OTP gagal terkirim untuk
-- setiap pengguna lama, dan gejalanya (422) menyerupai gangguan gateway
UPDATE "User"
SET "phone" = CASE
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '62%'
    THEN regexp_replace("phone", '[^0-9]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '0%'
    THEN '62' || substring(regexp_replace("phone", '[^0-9]', '', 'g') from 2)
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '8%'
    THEN '62' || regexp_replace("phone", '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE "phone" IS NOT NULL;

-- buang yang tidak memenuhi bentuk kanonik (nomor tetap, terlalu pendek/panjang)
-- Harus sama persis dengan CANONICAL di src/lib/phone.ts: /^628\d{8,11}$/
UPDATE "User" SET "phone" = NULL
WHERE "phone" IS NOT NULL AND "phone" !~ '^628[0-9]{8,11}$';

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "method" "SecondFactor" NOT NULL,
    "otpHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_purpose_createdAt_idx" ON "AuthChallenge"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One-time promotion of the bootstrap account. Scoped to the seeded
-- username and its pre-migration role so a deliberate demotion later is
-- never silently undone.
UPDATE "User" SET "role" = 'SUPERADMIN'
WHERE "username" = 'admin' AND "role" = 'ADMIN';
