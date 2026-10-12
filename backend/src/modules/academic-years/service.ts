import { lockStudent } from '../students/repository.js';
import { lockCvSource, sourceHash } from '../cv/source.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  listQuerySchema,
  normalizeArabic,
  academicYearLabelSchema,
  rolloverSchema,
} from '@quba/shared';
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

export function createAcademicYearService(db: PrismaClient) {
  async function getSettings() {
    const years = await db.academicYear.findMany({
      orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
    });

    const current = years.find((y) => y.status === 'OPEN');

    if (!current) throw new AppError(409, 'YEAR_CLOSED', 'لا توجد سنة دراسية مفتوحة.');

    const groups = await db.student.groupBy({
      by: ['grade'],
      where: { academicYearId: current.id, status: 'ACTIVE' },
      _count: true,
    });

    const counts = { FIRST: 0, SECOND: 0, THIRD: 0 };

    for (const g of groups) counts[g.grade] = g._count;

    const view = (y: typeof current) => ({
      id: y.id,
      label: y.label,
      status: y.status,
      openedAt: y.openedAt,
      closedAt: y.closedAt,
    });

    return { years: years.map(view), current: view(current), counts };
  }
  async function rename(input: z.infer<typeof academicYearLabelSchema>) {
    return db.$transaction(async (tx) => {
      const current = await lockOpenYear(tx);
      return tx.academicYear.update({
        where: { id: current.id },
        data: input,
        select: { id: true, label: true, status: true, openedAt: true, closedAt: true },
      });
    });
  }
  async function rollover(input: z.infer<typeof rolloverSchema>) {
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AcademicYear" WHERE id=${input.yearId}::uuid FOR UPDATE`;
        const old = await tx.academicYear.findUnique({ where: { id: input.yearId } });
        if (!old) throw new AppError(404, 'YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة.');
        if (old.status !== 'OPEN') {
          if (old.rolloverRequestId === input.requestId && old.rolloverResult) {
            const result = old.rolloverResult as { label?: string };
            if (result.label === input.label) return old.rolloverResult;
          }
          throw new AppError(
            409,
            'YEAR_ALREADY_CLOSED',
            'أُغلقت هذه السنة وتم الترحيل سابقًا. حدّث الصفحة.',
          );
        }
        const students = await tx.student.findMany({
          where: { academicYearId: old.id, status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        });
        // Lock student parents, preserving CV/works and serializing with their existing writers.
        for (const student of students) await lockStudent(tx, student.id);
        const now = new Date();
        await tx.academicYear.update({
          where: { id: old.id },
          data: { status: 'CLOSED', closedAt: now },
        });
        const next = await tx.academicYear.create({ data: { label: input.label, openedAt: now } });
        const counts = { FIRST: 0, SECOND: 0, THIRD: 0 };
        for (const row of students) {
          const student = await tx.student.findUniqueOrThrow({ where: { id: row.id } });
          // A concurrent final deletion before parent locking may have removed a row.
          const before = await lockCvSource(tx, student.id);
          const oldHash = sourceHash(before);
          const cv = await tx.studentCv.findUnique({ where: { studentId: student.id } });
          counts[student.grade]++;
          await tx.student.update({
            where: { id: student.id },
            data:
              student.grade === 'THIRD'
                ? { status: 'ARCHIVED', archivedAt: now, updatedAt: student.updatedAt }
                : {
                    grade: student.grade === 'FIRST' ? 'SECOND' : 'THIRD',
                    academicYearId: next.id,
                    updatedAt: student.updatedAt,
                  },
          });
          if (cv) {
            const newHash = sourceHash(await lockCvSource(tx, student.id));
            // Only rebase previously fresh hashes; an existing stale CV stays stale.
            await tx.studentCv.update({
              where: { studentId: student.id },
              data: {
                ...(cv.draftSourceHash === oldHash ? { draftSourceHash: newHash } : {}),
                ...(cv.approvedSourceHash === oldHash ? { approvedSourceHash: newHash } : {}),
              },
            });
          }
        }
        const result = {
          yearId: old.id,
          newYearId: next.id,
          label: input.label,
          closedAt: now.toISOString(),
          counts,
        };
        await tx.academicYear.update({
          where: { id: old.id },
          data: { rolloverRequestId: input.requestId, rolloverResult: result },
        });
        return result;
      },
      { timeout: 60000 },
    );
  }
  return { getSettings, rename, rollover };
}
