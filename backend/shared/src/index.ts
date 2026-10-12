// Stable public API: domain schemas and types live in focused modules.
export { normalizeArabic, catalogNameKey } from './normalization.js';
export { gradeLabels, FILE_LIMIT, MAX_ATTACHMENTS } from './constants.js';
export {
  gradeSchema,
  dateSchema,
  achievementSchema,
  supervisorSchema,
  phoneNumberSchema,
} from './schemas/common.js';
export {
  loginSchema,
  adminSetupSchema,
  type LoginInput,
  type AdminIdentity,
  type SessionResponse,
} from './schemas/auth.js';
export {
  academicYearLabelSchema,
  rolloverSchema,
  type AcademicYearView,
  type YearSettings,
  type DashboardView,
} from './schemas/academic-years.js';
export {
  catalogSchema,
  talentCatalogSchema,
  type CatalogItem,
  type CatalogView,
} from './schemas/catalogs.js';
export {
  studentSchema,
  storedStudentSchema,
  namedStudentSchema,
  studentSubmissionSchema,
  type NamedStudentInput,
  type StudentInput,
  type StudentView,
  listQuerySchema,
} from './schemas/students.js';
export {
  registrationSchema,
  namedRegistrationSchema,
  registrationSubmissionSchema,
  registrationApprovalSchema,
  registrationQuerySchema,
  type RegistrationInput,
  type RegistrationView,
} from './schemas/registrations.js';
export {
  safeUrlSchema,
  workSchema,
  type WorkInput,
  type AttachmentView,
  type WorkView,
} from './schemas/works.js';
export { schoolSchema, type SchoolInput, type SchoolView } from './schemas/school.js';
export {
  legacyCvSchema,
  cvContentSchema,
  cvSchema,
  cvGenerationContentSchema,
  cvHeaderLines,
  cvSnapshotSchema,
  cvEditSchema,
  cvRevisionSchema,
  cvApprovalSchema,
  cvGenerateSchema,
  cvBatchSchema,
  type CvData,
  type CvSource,
  type CvState,
} from './schemas/cv.js';
export { idParamsSchema, type ApiErrorBody, type PageResult } from './schemas/http.js';
