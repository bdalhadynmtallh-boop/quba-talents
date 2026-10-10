BEGIN;
DO $$ BEGIN IF current_setting('server_encoding')<>'UTF8' THEN RAISE EXCEPTION 'Academic year migration requires a UTF8 database'; END IF; END $$;
CREATE TYPE "AcademicYearStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TABLE "AcademicYear" (
  "id" UUID PRIMARY KEY, "label" VARCHAR(40) NOT NULL,
  "status" "AcademicYearStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
  "rolloverRequestId" UUID UNIQUE, "rolloverResult" JSONB,
  CHECK (length(btrim("label")) BETWEEN 2 AND 40),
  CHECK (("status"='OPEN' AND "closedAt" IS NULL) OR ("status"='CLOSED' AND "closedAt" IS NOT NULL))
);
-- Partial unique index enforces one open year even outside the application.
CREATE UNIQUE INDEX "AcademicYear_one_open" ON "AcademicYear" (("status")) WHERE "status"='OPEN';
INSERT INTO "AcademicYear" ("id", "label") VALUES (gen_random_uuid(), 'السنة الحالية');
INSERT INTO "SchoolSettings" ("id", "updatedAt") VALUES ('school', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
CREATE TABLE "Classroom" (
  "id" UUID PRIMARY KEY, "schoolId" TEXT NOT NULL DEFAULT 'school' REFERENCES "SchoolSettings"("id") ON DELETE RESTRICT,
  "name" VARCHAR(30) NOT NULL, "nameKey" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  CHECK (length(btrim("name")) BETWEEN 1 AND 30), CHECK (length("nameKey")>0), CHECK ("sortOrder">=0)
);
CREATE TABLE "Talent" (
  "id" UUID PRIMARY KEY, "schoolId" TEXT NOT NULL DEFAULT 'school' REFERENCES "SchoolSettings"("id") ON DELETE RESTRICT,
  "name" VARCHAR(80) NOT NULL, "nameKey" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  CHECK (length(btrim("name")) BETWEEN 1 AND 80 AND (NOT "active" OR length(btrim("name"))>=2)), CHECK (length("nameKey")>0), CHECK ("sortOrder">=0)
);
CREATE UNIQUE INDEX "Classroom_schoolId_nameKey_key" ON "Classroom" ("schoolId", "nameKey");
CREATE UNIQUE INDEX "Talent_schoolId_nameKey_key" ON "Talent" ("schoolId", "nameKey");
CREATE INDEX "Classroom_schoolId_active_sortOrder_idx" ON "Classroom" ("schoolId", "active", "sortOrder");
CREATE INDEX "Talent_schoolId_active_sortOrder_idx" ON "Talent" ("schoolId", "active", "sortOrder");
-- Temporary backfill helpers mirror the shared normalizer; no user text is interpolated.
CREATE FUNCTION pg_temp.ar_search(v TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(translate(regexp_replace(coalesce(v,''), U&'[\064B-\065F\0670\0640]', '', 'g'), 'أإآٱىة', 'اااايه'), '\s+', ' ', 'g')))
$$;
CREATE FUNCTION pg_temp.ar_key(v TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT regexp_replace(pg_temp.ar_search(v), '(^| )ال(?=[ء-ي])', '\1', 'g')
$$;
INSERT INTO "Classroom" ("id", "name", "nameKey", "active")
SELECT gen_random_uuid(), coalesce(min(nullif(btrim(v),'')) FILTER (WHERE pg_temp.ar_key(v)<>''), 'غير محدد'), k, bool_or(pg_temp.ar_key(v)<>'')
FROM (SELECT v, coalesce(nullif(pg_temp.ar_key(v),''),pg_temp.ar_key('غير محدد')) k FROM (
  SELECT "classroom" v FROM "Student" UNION ALL SELECT "classroom" FROM "RegistrationRequest"
) vals) keys GROUP BY k;
INSERT INTO "Talent" ("id", "name", "nameKey", "active")
SELECT gen_random_uuid(), coalesce(min(nullif(btrim(v),'')) FILTER (WHERE pg_temp.ar_key(v)<>''), 'غير محدد'), k, bool_or(pg_temp.ar_key(v)<>'' AND length(btrim(v))>=2)
FROM (SELECT v, coalesce(nullif(pg_temp.ar_key(v),''),pg_temp.ar_key('غير محدد')) k FROM (
  SELECT "primaryTalent" v FROM "Student" UNION ALL SELECT "primaryTalent" FROM "RegistrationRequest"
  UNION ALL SELECT unnest("additionalTalents") FROM "Student"
) vals) keys GROUP BY k;
ALTER TABLE "Student" ADD COLUMN "nameSearch" TEXT, ADD COLUMN "classroomId" UUID, ADD COLUMN "primaryTalentId" UUID,
  ADD COLUMN "academicYearId" UUID, ADD COLUMN "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE', ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "RegistrationRequest" ADD COLUMN "nameSearch" TEXT, ADD COLUMN "classroomId" UUID, ADD COLUMN "primaryTalentId" UUID;
UPDATE "Student" SET "nameSearch"=pg_temp.ar_search("name"), "academicYearId"=(SELECT "id" FROM "AcademicYear" WHERE "status"='OPEN');
UPDATE "RegistrationRequest" SET "nameSearch"=pg_temp.ar_search("name");
UPDATE "Student" s SET "classroomId"=c."id" FROM "Classroom" c WHERE c."nameKey"=coalesce(nullif(pg_temp.ar_key(s."classroom"),''),pg_temp.ar_key('غير محدد'));
UPDATE "Student" s SET "primaryTalentId"=t."id" FROM "Talent" t WHERE t."nameKey"=coalesce(nullif(pg_temp.ar_key(s."primaryTalent"),''),pg_temp.ar_key('غير محدد'));
UPDATE "RegistrationRequest" r SET "classroomId"=c."id" FROM "Classroom" c WHERE c."nameKey"=coalesce(nullif(pg_temp.ar_key(r."classroom"),''),pg_temp.ar_key('غير محدد'));
UPDATE "RegistrationRequest" r SET "primaryTalentId"=t."id" FROM "Talent" t WHERE t."nameKey"=coalesce(nullif(pg_temp.ar_key(r."primaryTalent"),''),pg_temp.ar_key('غير محدد'));
CREATE TABLE "StudentTalent" (
  "studentId" UUID NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE,
  "talentId" UUID NOT NULL REFERENCES "Talent"("id") ON DELETE RESTRICT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("studentId", "talentId")
);
CREATE TABLE "RegistrationTalent" (
  "registrationId" UUID NOT NULL REFERENCES "RegistrationRequest"("id") ON DELETE CASCADE,
  "talentId" UUID NOT NULL REFERENCES "Talent"("id") ON DELETE RESTRICT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("registrationId", "talentId")
);
INSERT INTO "StudentTalent" ("studentId", "talentId", "sortOrder")
SELECT s."id", t."id", min(v.pos)::int FROM "Student" s
CROSS JOIN LATERAL unnest(s."additionalTalents") WITH ORDINALITY v(name,pos)
JOIN "Talent" t ON t."nameKey"=coalesce(nullif(pg_temp.ar_key(v.name),''),pg_temp.ar_key('غير محدد'))
WHERE t."id"<>s."primaryTalentId" GROUP BY s."id", t."id";
ALTER TABLE "Student" ALTER COLUMN "nameSearch" SET NOT NULL, ALTER COLUMN "classroomId" SET NOT NULL, ALTER COLUMN "primaryTalentId" SET NOT NULL, ALTER COLUMN "academicYearId" SET NOT NULL;
ALTER TABLE "RegistrationRequest" ALTER COLUMN "nameSearch" SET NOT NULL, ALTER COLUMN "classroomId" SET NOT NULL, ALTER COLUMN "primaryTalentId" SET NOT NULL;
ALTER TABLE "Student" ADD CONSTRAINT "Student_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "Student_primaryTalentId_fkey" FOREIGN KEY ("primaryTalentId") REFERENCES "Talent"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "Student_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "Student_archive_state" CHECK (("status"='ACTIVE' AND "archivedAt" IS NULL) OR ("status"='ARCHIVED' AND "archivedAt" IS NOT NULL AND "grade"='THIRD'));
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "RegistrationRequest_primaryTalentId_fkey" FOREIGN KEY ("primaryTalentId") REFERENCES "Talent"("id") ON DELETE RESTRICT;
DROP INDEX "Student_grade_primaryTalent_idx";
DROP INDEX "Student_name_idx";
ALTER TABLE "Student" DROP COLUMN "classroom", DROP COLUMN "primaryTalent", DROP COLUMN "additionalTalents";
ALTER TABLE "RegistrationRequest" DROP COLUMN "classroom", DROP COLUMN "primaryTalent";
CREATE INDEX "Student_academicYearId_status_grade_idx" ON "Student" ("academicYearId", "status", "grade");
CREATE INDEX "Student_primaryTalentId_idx" ON "Student" ("primaryTalentId");
CREATE INDEX "Student_classroomId_idx" ON "Student" ("classroomId");
CREATE INDEX "Student_nameSearch_idx" ON "Student" ("nameSearch");
CREATE INDEX "RegistrationRequest_nameSearch_idx" ON "RegistrationRequest" ("nameSearch");
CREATE INDEX "RegistrationRequest_classroomId_idx" ON "RegistrationRequest" ("classroomId");
CREATE INDEX "RegistrationRequest_primaryTalentId_idx" ON "RegistrationRequest" ("primaryTalentId");
CREATE INDEX "StudentTalent_talentId_idx" ON "StudentTalent" ("talentId");
CREATE INDEX "RegistrationTalent_talentId_idx" ON "RegistrationTalent" ("talentId");
-- Preserve the existing private-cloud table policy for all new tables.
DO $$ DECLARE table_name TEXT; role_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['AcademicYear','Classroom','Talent','StudentTalent','RegistrationTalent'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,role_name); END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
