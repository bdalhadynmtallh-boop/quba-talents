-- AlterTable
ALTER TABLE "StudentCv" ADD COLUMN     "approvedSnapshot" JSONB,
ADD COLUMN     "approvedSourceHash" TEXT,
ADD COLUMN     "draftSnapshot" JSONB,
ADD COLUMN     "draftSourceHash" TEXT,
ADD COLUMN     "generationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "generationToken" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;
