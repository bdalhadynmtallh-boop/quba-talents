import type { Prisma } from '../../generated/prisma/client.js';
import type { StudentInput } from '@quba/shared';
import { AppError } from '../../lib/errors.js';

export const studentRelations = {
  classroom: true,
  primaryTalent: true,
  academicYear: true,
  additionalTalents: { include: { talent: true }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.StudentInclude;
export const registrationRelations = {
  classroom: true,
  primaryTalent: true,
  additionalTalents: { include: { talent: true }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.RegistrationRequestInclude;
export async function validateCatalog(
  tx: Prisma.TransactionClient,
  input: Pick<StudentInput, 'classroomId' | 'primaryTalentId' | 'additionalTalentIds'>,
  previous?: Pick<StudentInput, 'classroomId' | 'primaryTalentId' | 'additionalTalentIds'>,
) {
  if (input.additionalTalentIds.includes(input.primaryTalentId))
    throw new AppError(400, 'DUPLICATE_TALENT', 'لا تكرر الموهبة الرئيسية ضمن المواهب الإضافية.');
  // Share locks serialize validation with catalog disabling/renaming.
  const ids = [...new Set([input.primaryTalentId, ...input.additionalTalentIds])].sort();
  await tx.$queryRaw`SELECT id FROM "Classroom" WHERE id=${input.classroomId}::uuid FOR SHARE`;
  for (const id of ids) await tx.$queryRaw`SELECT id FROM "Talent" WHERE id=${id}::uuid FOR SHARE`;
  const classroom = await tx.classroom.findUnique({ where: { id: input.classroomId } });
  const talents = await tx.talent.findMany({ where: { id: { in: ids }, schoolId: 'school' } });
  if (
    !classroom ||
    classroom.schoolId !== 'school' ||
    (!classroom.active && previous?.classroomId !== classroom.id)
  )
    throw new AppError(
      400,
      'CLASSROOM_UNAVAILABLE',
      'الفصل المختار غير متاح. يضبط المسؤول الفصول من إعدادات المدرسة.',
    );
  for (const id of ids) {
    const talent = talents.find((t) => t.id === id);
    const retained =
      previous &&
      (id === input.primaryTalentId
        ? previous.primaryTalentId === id
        : previous.additionalTalentIds.includes(id));
    if (!talent || (!talent.active && !retained))
      throw new AppError(
        400,
        'TALENT_UNAVAILABLE',
        'الموهبة المختارة غير متاحة. يضبط المسؤول المواهب من إعدادات المدرسة.',
      );
  }
}
