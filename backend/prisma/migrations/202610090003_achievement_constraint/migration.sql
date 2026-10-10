UPDATE "Student" SET "achievements"='[]'::jsonb WHERE "achievements" IS NULL;
ALTER TABLE "Student" ALTER COLUMN "achievements" SET NOT NULL;