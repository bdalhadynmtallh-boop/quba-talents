import { z } from 'zod';
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
export const adminSetupSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(100),
  password: z.string().min(14).max(256),
});
export const gradeSchema = z.enum(['FIRST', 'SECOND', 'THIRD']);
export const dateSchema = z.iso.date().nullable().optional();
export const achievementSchema = z
  .object({ title: z.string().trim().min(1).max(500), date: dateSchema })
  .strict();
export const supervisorSchema = z
  .object({ name: z.string().trim().min(2).max(100), role: z.string().trim().min(2).max(120) })
  .strict();
export const studentSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    grade: gradeSchema,
    classroom: z.string().trim().min(1).max(30),
    primaryTalent: z.string().trim().min(2).max(80),
    additionalTalents: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
    skills: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    achievements: z.array(achievementSchema).max(30).default([]),
    notes: z.string().trim().max(5000).default(''),
    supervisorOverrides: z.array(supervisorSchema).max(10).nullable().default(null),
  })
  .strict();
export const registrationSchema = studentSchema
  .pick({ name: true, grade: true, classroom: true, primaryTalent: true })
  .extend({ description: z.string().trim().min(10).max(1000) })
  .strict();
export const safeUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'أدخل رابط http أو https صحيحًا.');
export const workSchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().max(3000).default(''),
    date: dateSchema,
    studentRole: z.string().trim().max(500).default(''),
    url: safeUrlSchema.default(''),
  })
  .strict();
export const schoolSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    supervisors: z.array(supervisorSchema).max(10),
  })
  .strict();
export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
    search: z.string().trim().max(120).default(''),
    grade: gradeSchema.optional(),
    talent: z.string().trim().max(80).optional(),
  })
  .strict();
export const registrationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  })
  .strict();
export const idParamsSchema = z.object({
  studentId: z.uuid().optional(),
  workId: z.uuid().optional(),
  attachmentId: z.uuid().optional(),
  id: z.uuid().optional(),
});
export const legacyCvSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(2),
    grade: gradeSchema,
    classroom: z.string(),
    primaryTalent: z.string(),
    about: z.string().max(5000),
    skills: z.array(z.string()),
    achievements: z.array(achievementSchema),
    works: z.array(workSchema),
    supervisors: z.array(supervisorSchema),
  })
  .strict();
export const cvContentSchema = z
  .object({
    summary: z.string().trim().max(5000),
    talents: z.array(z.string().trim().min(1).max(200)).max(20),
    skills: z.array(z.string().trim().min(1).max(200)).max(40),
    achievements: z.array(achievementSchema.extend({ date: z.iso.date().nullable() })).max(40),
    projects: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(150),
            description: z.string().trim().max(2000),
            studentRole: z.string().trim().max(500),
            date: z.iso.date().nullable(),
          })
          .strict(),
      )
      .max(40),
    missingInformation: z.array(z.string().trim().min(1).max(300)).max(15),
  })
  .strict();
export const cvSchema = cvContentSchema.extend({ version: z.literal(2) }).strict();
export const cvSnapshotSchema = z
  .object({
    name: z.string(),
    grade: gradeSchema,
    classroom: z.string(),
    primaryTalent: z.string(),
    schoolName: z.string(),
    supervisors: z.array(supervisorSchema),
  })
  .strict();
export const cvEditSchema = z
  .object({ revision: z.number().int().min(0), content: cvSchema })
  .strict();
export const cvRevisionSchema = cvEditSchema.pick({ revision: true }).strict();
export const cvBatchSchema = z.union([
  z.object({ studentIds: z.array(z.uuid()).min(1).max(20) }).strict(),
  z.object({ filters: listQuerySchema.pick({ search: true, grade: true, talent: true }) }).strict(),
]);
export type LoginInput = z.infer<typeof loginSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type WorkInput = z.infer<typeof workSchema>;
export type SchoolInput = z.infer<typeof schoolSchema>;
export type CvData = z.infer<typeof cvSchema>;
export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}
export interface SessionResponse {
  admin: AdminIdentity | null;
}
export interface ApiErrorBody {
  message: string;
  code: string;
}
export interface AttachmentView {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}
export interface WorkView extends Omit<WorkInput, 'date'> {
  id: string;
  studentId: string;
  date: string | null;
  attachments: AttachmentView[];
  createdAt: string;
  updatedAt: string;
}
export interface StudentView extends StudentInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  cv: { draft: CvData | null; approved: CvData | null; approvedAt: string | null } | null;
  works: WorkView[];
}
export interface RegistrationView extends RegistrationInput {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  studentId: string | null;
  createdAt: string;
}
export interface SchoolView extends SchoolInput {
  hasLogo: boolean;
  updatedAt: string;
}
export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  talents?: string[];
}
export interface CvSource {
  student: StudentView;
  school: SchoolView;
  supervisors: SchoolInput['supervisors'];
  sourceUpdatedAt: string;
}
export interface CvState {
  draft: CvData | null;
  approved: CvData | null;
  revision: number;
  approvedAt: string | null;
  draftUpdatedAt: string | null;
  draftSnapshot: z.infer<typeof cvSnapshotSchema> | null;
  approvedSnapshot: z.infer<typeof cvSnapshotSchema> | null;
  draftStale: boolean;
  approvedStale: boolean;
  generating: boolean;
  aiConfigured: boolean;
}
export const gradeLabels = {
  FIRST: 'الأول الثانوي',
  SECOND: 'الثاني الثانوي',
  THIRD: 'الثالث الثانوي',
} as const;
export const FILE_LIMIT = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;
