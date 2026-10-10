-- Preserve existing achievement strings as structured title/date records.
ALTER TABLE "Student" ALTER COLUMN "achievements" DROP DEFAULT;
ALTER TABLE "Student" ALTER COLUMN "achievements" TYPE JSONB USING to_jsonb("achievements");
UPDATE "Student" SET "achievements" = COALESCE((SELECT jsonb_agg(jsonb_build_object('title', item #>> '{}', 'date', NULL)) FROM jsonb_array_elements("achievements") AS item), '[]'::jsonb);
ALTER TABLE "Student" ALTER COLUMN "achievements" SET DEFAULT '[]'::jsonb;
ALTER TABLE "Student" ADD COLUMN "supervisorOverrides" JSONB;
ALTER TABLE "StudentCv" ADD COLUMN "draft" JSONB, ADD COLUMN "approved" JSONB, ADD COLUMN "draftUpdatedAt" TIMESTAMP(3), ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Work" ADD COLUMN "studentRole" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SchoolSettings" ADD COLUMN "logoKey" TEXT, ADD COLUMN "logoName" TEXT, ADD COLUMN "logoMimeType" TEXT;
CREATE UNIQUE INDEX "SchoolSettings_logoKey_key" ON "SchoolSettings"("logoKey");
CREATE TABLE "StorageDeletion" (
  "id" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StorageDeletion_storageKey_key" ON "StorageDeletion"("storageKey");