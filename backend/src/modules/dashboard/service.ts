import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
export async function getDashboard(db: PrismaClient) {
  return db.$transaction(
    async (tx) => {
      const year = await tx.academicYear.findFirst({
        where: { status: 'OPEN' },
        select: { id: true, label: true, status: true, openedAt: true, closedAt: true },
      });
      if (!year) throw new AppError(409, 'YEAR_CLOSED', 'لا توجد سنة دراسية مفتوحة.');
      const where = { academicYearId: year.id, status: 'ACTIVE' as const };
      const pendingRequests = await tx.registrationRequest.count({
        where: { status: 'PENDING' },
      });
      const approvedCvs = await tx.student.count({
        where: { ...where, cv: { approvedAt: { not: null } } },
      });
      const groups = await tx.student.groupBy({ by: ['grade'], where, _count: true });
      const grades = { FIRST: 0, SECOND: 0, THIRD: 0 };
      for (const row of groups) grades[row.grade] = row._count;
      const talentGroups = await tx.student.groupBy({
        by: ['primaryTalentId'],
        where,
        _count: true,
      });
      const catalog = await tx.talent.findMany({
        where: { id: { in: talentGroups.map((t) => t.primaryTalentId) } },
      });
      const talents = talentGroups
        .map((t) => ({
          id: t.primaryTalentId,
          name: catalog.find((c) => c.id === t.primaryTalentId)!.name,
          count: t._count,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
      return { academicYear: year, pendingRequests, approvedCvs, grades, talents };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
