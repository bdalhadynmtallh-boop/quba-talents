import { z } from 'zod';
import { studentFieldsSchema, studentSubmissionSchema } from './students.js';
import { gradeSchema, requiredPhoneNumberSchema } from './common.js';
import { namedCatalogFields, distinctTalentNames } from './catalogs.js';

export const registrationSchema = studentFieldsSchema
  .pick({
    name: true,
    phoneNumber: true,
    grade: true,
    classroomId: true,
    primaryTalentId: true,
    additionalTalentIds: true,
  })
  .extend({ description: z.string().trim().min(10).max(1000) })
  .strict()
  .refine((value) => !value.additionalTalentIds.includes(value.primaryTalentId), {
    message: 'لا تكرر الموهبة الرئيسية.',
    path: ['additionalTalentIds'],
  });

export const namedRegistrationSchema = z
  .object({
    name: studentFieldsSchema.shape.name,
    phoneNumber: requiredPhoneNumberSchema,
    grade: gradeSchema,
    ...namedCatalogFields,
    description: z.string().trim().min(10).max(1000),
  })
  .strict()
  .refine(distinctTalentNames, { message: 'لا تكرر المواهب.', path: ['additionalTalents'] });

export const registrationSubmissionSchema = z.union([namedRegistrationSchema, registrationSchema]);
export const registrationApprovalSchema = z.union([
  z
    .object({
      student: studentSubmissionSchema,
      targetAcademicYearId: z.uuid(),
      confirmAcademicPlacement: z.boolean(),
    })
    .strict(),
  studentSubmissionSchema,
]);

export const registrationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;

export interface RegistrationView extends RegistrationInput {
  classroom: string;
  primaryTalent: string;
  additionalTalents: string[];
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  studentId: string | null;
  academicYearId: string | null;
  academicYearLabel: string | null;
  requiresAcademicConfirmation: boolean;
  studentDeletedAt: string | null;
  similarRequestCount: number;
  createdAt: string;
}
