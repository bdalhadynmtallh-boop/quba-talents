import { z } from 'zod';
import { gradeSchema, achievementSchema, supervisorSchema, phoneNumberSchema } from './common.js';
import { workSchema } from './works.js';
import { listQuerySchema, type StudentView } from './students.js';
import type { SchoolInput, SchoolView } from './school.js';

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
    suggestedSkills: z.array(z.string().trim().min(1).max(200)).max(3).optional(),
    futureGoals: z.array(z.string().trim().min(1).max(300)).max(3).optional(),
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

// New generation requires three suggestions; stored version 2 CVs may omit them.
export const cvGenerationContentSchema = cvContentSchema
  .extend({
    suggestedSkills: z.array(z.string().trim().min(1).max(200)).length(3),
    futureGoals: z.array(z.string().trim().min(1).max(300)).length(3),
  })
  .strict();

export const cvHeaderLines = [
  'المملكة العربية السعودية',
  'الإدارة العامة للتعليم بمنطقة المدينة المنورة',
  'مجمع ثانوية قباء',
] as const;

export const cvSnapshotSchema = z
  .object({
    name: z.string(),
    phoneNumber: phoneNumberSchema.optional(),
    grade: gradeSchema,
    classroom: z.string(),
    primaryTalent: z.string(),
    schoolName: z.string(),
    academicYearLabel: z.string().optional(),
    supervisors: z.array(supervisorSchema),
  })
  .strict();

export const cvEditSchema = z
  .object({ revision: z.number().int().min(0), content: cvSchema })
  .strict();

export const cvRevisionSchema = cvEditSchema.pick({ revision: true }).strict();
export const cvApprovalSchema = cvRevisionSchema
  .extend({ studentReviewed: z.literal(true) })
  .strict();
export const cvGenerateSchema = cvRevisionSchema
  .extend({
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const cvBatchSchema = z.union([
  z
    .object({
      studentIds: z.array(z.uuid()).min(1).max(20),
      scope: listQuerySchema.pick({ academicYearId: true, status: true }).optional(),
    })
    .strict(),
  z.object({ filters: listQuerySchema.omit({ page: true, pageSize: true }) }).strict(),
]);

export type CvData = z.infer<typeof cvSchema>;

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
  latestReview: {
    revision: number;
    reviewerName: string;
    approvedAt: string;
    studentReviewedAt: string;
  } | null;
  legacyApproval: boolean;
}
