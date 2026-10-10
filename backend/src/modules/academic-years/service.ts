import type { Prisma } from '../../generated/prisma/client.js';
import { listQuerySchema, normalizeArabic } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import type { z } from 'zod';
export async function lockOpenYear(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "AcademicYear" WHERE status='OPEN' FOR UPDATE`;
  if (!rows[0])
    throw new AppError(409, 'YEAR_CLOSED', 'لا توجد سنة دراسية مفتوحة. حدّث الصفحة وحاول مجددًا.');
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: rows[0].id } });
  if (year.status !== 'OPEN')
    throw new AppError(409, 'YEAR_CLOSED', 'السنة الدراسية مغلقة. حدّث الصفحة.');
  return year;
}
export async function studentScope(
  db: Prisma.TransactionClient,
  query: z.infer<typeof listQuerySchema>,
): Promise<Prisma.StudentWhereInput> {
  const year = query.academicYearId
    ? await db.academicYear.findUnique({ where: { id: query.academicYearId } })
    : await db.academicYear.findFirst({ where: { status: 'OPEN' } });
  if (!year) throw new AppError(404, 'YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة.');
  const search = normalizeArabic(query.search);
  return {
    academicYearId: year.id,
    status: query.status ?? (year.status === 'OPEN' ? 'ACTIVE' : 'ARCHIVED'),
    ...(search ? { nameSearch: { contains: search } } : {}),
    ...(query.grade ? { grade: query.grade } : {}),
    ...(query.talent ? { primaryTalentId: query.talent } : {}),
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.approved ? { cv: { approvedAt: { not: null } } } : {}),
  };
}
