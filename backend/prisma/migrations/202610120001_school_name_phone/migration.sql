ALTER TABLE "Student" ADD COLUMN "phoneNumber" VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE "RegistrationRequest" ADD COLUMN "phoneNumber" VARCHAR(16) NOT NULL DEFAULT '';

ALTER TABLE "SchoolSettings" ALTER COLUMN "name" SET DEFAULT 'موهوبين مجمع ثانوية قباء';
UPDATE "SchoolSettings"
SET "name" = 'موهوبين مجمع ثانوية قباء', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'school' AND "name" = 'موهوبين ثانوية قباء';
