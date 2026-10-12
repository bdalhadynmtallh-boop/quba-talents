BEGIN;
ALTER TABLE "RegistrationRequest"
  ADD COLUMN "requestKey" UUID,
  ADD COLUMN "payloadHash" CHAR(64),
  ADD COLUMN "academicYearId" UUID,
  ADD COLUMN "studentDeletedAt" TIMESTAMP(3),
  ADD CONSTRAINT "RegistrationRequest_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RegistrationRequest_request_payload_check" CHECK (("requestKey" IS NULL) = ("payloadHash" IS NULL)),
  ADD CONSTRAINT "RegistrationRequest_deleted_student_check" CHECK ("studentDeletedAt" IS NULL OR ("status" = 'APPROVED' AND "studentId" IS NULL));
CREATE UNIQUE INDEX "RegistrationRequest_requestKey_key" ON "RegistrationRequest"("requestKey");
CREATE INDEX "RegistrationRequest_reviewedById_idx" ON "RegistrationRequest"("reviewedById");
CREATE INDEX "RegistrationRequest_academicYearId_status_createdAt_idx" ON "RegistrationRequest"("academicYearId", "status", "createdAt");
CREATE INDEX "RegistrationRequest_phoneNumber_idx" ON "RegistrationRequest"("phoneNumber");
CREATE TABLE "CvReview" (
  "id" UUID NOT NULL,
  "cvId" UUID NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
  "sourceHash" CHAR(64) NOT NULL,
  "reviewerId" UUID,
  "reviewerName" VARCHAR(100) NOT NULL,
  "studentReviewedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CvReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CvReview_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "StudentCv"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CvReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CvReview_cvId_revision_key" ON "CvReview"("cvId", "revision");
CREATE INDEX "CvReview_reviewerId_idx" ON "CvReview"("reviewerId");
ALTER TABLE "CvReview" ENABLE ROW LEVEL SECURITY;
-- No public Data API access: all reviews use the authenticated school backend.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "CvReview" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "CvReview" FROM authenticated;
  END IF;
END $$;
REVOKE ALL ON "CvReview" FROM PUBLIC;
-- Record the deletion even if it is performed outside the HTTP service.
CREATE FUNCTION public.record_student_deletion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public."RegistrationRequest" SET "studentId" = NULL, "studentDeletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "studentId" = OLD.id AND "status" = 'APPROVED';
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.record_student_deletion() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.record_student_deletion() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.record_student_deletion() FROM authenticated; END IF;
END $$;
CREATE TRIGGER student_deletion_event BEFORE DELETE ON "Student" FOR EACH ROW EXECUTE FUNCTION public.record_student_deletion();
COMMIT;
