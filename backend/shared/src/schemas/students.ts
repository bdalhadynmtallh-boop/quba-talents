import { z } from 'zod';
import {
  gradeSchema,
  achievementSchema,
  supervisorSchema,
  phoneNumberSchema,
  requiredPhoneNumberSchema,
} from './common.js';
import { namedCatalogFields, distinctTalentNames } from './catalogs.js';
import type { CvData } from './cv.js';
import type { WorkView } from './works.js';

export const studentFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phoneNumber: requiredPhoneNumberSchema,
    grade: gradeSchema,
    classroomId: z.uuid(),
    primaryTalentId: z.uuid(),
    additionalTalentIds: z
      .array(z.uuid())
      .max(10)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length),
    skills: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    achievements: z.array(achievementSchema).max(30).default([]),
    notes: z.string().trim().max(5000).default(''),
    supervisorOverrides: z.array(supervisorSchema).max(10).nullable().default(null),
  })
  .strict();

export const studentSchema = studentFieldsSchema.refine(
  (value) => !value.additionalTalentIds.includes(value.primaryTalentId),
  { message: 'لا تكرر الموهبة الرئيسية.', path: ['additionalTalentIds'] },
);

// Older records remain readable until an administrator supplies their number.
export const storedStudentSchema = studentFieldsSchema
  .extend({ phoneNumber: phoneNumberSchema.default('') })
  .refine((value) => !value.additionalTalentIds.includes(value.primaryTalentId), {
    message: 'لا تكرر الموهبة الرئيسية.',
    path: ['additionalTalentIds'],
  });

export const namedStudentSchema = studentFieldsSchema
  .omit({ classroomId: true, primaryTalentId: true, additionalTalentIds: true })
  .extend(namedCatalogFields)
  .strict()
  .refine(distinctTalentNames, { message: 'لا تكرر المواهب.', path: ['additionalTalents'] });

// Accept older clients during a rolling deployment; stored relationships keep their IDs.
export const studentSubmissionSchema = z.union([namedStudentSchema, studentSchema]);

export type NamedStudentInput = z.infer<typeof namedStudentSchema>;

export type StudentInput = z.infer<typeof studentSchema>;

export interface StudentView extends StudentInput {
  classroom: string;
  primaryTalent: string;
  additionalTalents: string[];
  academicYearId: string;
  academicYearLabel: string;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
  id: string;
  createdAt: string;
  updatedAt: string;
  cv: { draft: CvData | null; approved: CvData | null; approvedAt: string | null } | null;
  works: WorkView[];
}

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
    search: z.string().trim().max(120).default(''),
    grade: gradeSchema.optional(),
    talent: z.uuid().optional(),
    classroomId: z.uuid().optional(),
    academicYearId: z.uuid().optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
    approved: z.enum(['true']).optional(),
  })
  .strict();
