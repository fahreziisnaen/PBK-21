-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('AKTIF', 'ALUMNI');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "academicYearId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "graduatedAt" TIMESTAMP(3),
ADD COLUMN     "graduatedYear" TEXT,
ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'AKTIF';

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_name_key" ON "AcademicYear"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_startYear_key" ON "AcademicYear"("startYear");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

