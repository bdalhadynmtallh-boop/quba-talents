import type { Prisma } from '../../generated/prisma/client.js';
import { catalogNameKey, type StudentInput } from '@quba/shared';
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
export async function resolveCatalogNames(
  tx: Prisma.TransactionClient,
  input: { classroom: string; primaryTalent: string; additionalTalents: string[] },
  active: boolean,
) {
  // Public submissions add inactive entries for review, without changing existing school settings.
  const classroom = await tx.classroom.upsert({
    where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey(input.classroom) } },
    create: { name: input.classroom, nameKey: catalogNameKey(input.classroom), active },
    update: {},
  });
  const talents = [];
  for (const name of [input.primaryTalent, ...input.additionalTalents]) {
    talents.push(
      await tx.talent.upsert({
        where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey(name) } },
        create: { name, nameKey: catalogNameKey(name), active },
        update: {},
      }),
    );
  }
  return {
    classroomId: classroom.id,
    primaryTalentId: talents[0]!.id,
    additionalTalentIds: talents.slice(1).map((talent) => talent.id),
  };
}
export async function resolveStudentSubmission(
  tx: Prisma.TransactionClient,
  input: StudentInput | import('@quba/shared').NamedStudentInput,
  previous?: StudentInput,
): Promise<StudentInput> {
  if ('classroom' in input) {
    const { classroom, primaryTalent, additionalTalents, ...fields } = input;
    const ids = await resolveCatalogNames(
      tx,
      { classroom, primaryTalent, additionalTalents },
      true,
    );
    // Explicit admin entry may retain or accept an inactive entry without reactivating it globally.
    await validateCatalog(tx, ids, ids);
    return { ...fields, ...ids };
  }
  await validateCatalog(tx, input, previous);
  return input;
}
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
