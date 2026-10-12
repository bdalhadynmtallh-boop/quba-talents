import type { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  registrationSubmissionSchema,
  registrationQuerySchema,
  registrationApprovalSchema,
  normalizeArabic,
} from '@quba/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { studentData } from '../students/serialization.js';
import {
  validateCatalog,
  registrationRelations,
  resolveCatalogNames,
  resolveStudentSubmission,
} from '../students/catalog.js';
import { lockOpenYear } from '../academic-years/service.js';

export function createRegistrationService(db: PrismaClient) {
  async function submit(
    submitted: z.infer<typeof registrationSubmissionSchema>,
    requestKey?: string,
  ) {
    const payloadHash = requestKey
      ? createHash('sha256').update(JSON.stringify(submitted)).digest('hex')
      : null;
    await db.$transaction(async (tx) => {
      const year = await lockOpenYear(tx);
      if (requestKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))`;
        const previous = await tx.registrationRequest.findUnique({ where: { requestKey } });
        if (previous) {
          if (previous.payloadHash !== payloadHash)
            throw new AppError(
              409,
              'REQUEST_KEY_REUSED',
              'تغير محتوى الطلب. أعد الإرسال بمفتاح جديد.',
            );
          return;
        }
      }
      let input;
      if ('classroom' in submitted) {
        const { classroom, primaryTalent, additionalTalents, ...fields } = submitted;
        input = {
          ...fields,
          ...(await resolveCatalogNames(
            tx,
            { classroom, primaryTalent, additionalTalents },
            false,
          )),
        };
      } else {
        await validateCatalog(tx, submitted);
        input = submitted;
      }
      const { additionalTalentIds, ...data } = input;
      await tx.registrationRequest.create({
        data: {
          ...data,
          academicYearId: year.id,
          requestKey,
          payloadHash,
          nameSearch: normalizeArabic(input.name),
          additionalTalents: {
            create: additionalTalentIds.map((talentId, sortOrder) => ({ talentId, sortOrder })),
          },
        },
      });
    });

    return { message: 'وصل طلب تسجيل موهبتك بنجاح. سيقوم المسؤول بمراجعته.' };
  }
  async function list(query: z.infer<typeof registrationQuerySchema>) {
    const where = { status: query.status };
    const openYear = await db.academicYear.findFirst({
      where: { status: 'OPEN' },
      select: { id: true },
    });

    const [items, total] = await db.$transaction([
      db.registrationRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { ...registrationRelations, academicYear: { select: { label: true } } },
      }),
      db.registrationRequest.count({ where }),
    ]);

    const similarities = await Promise.all(
      items.map((item) =>
        db.registrationRequest.count({
          where: {
            id: { not: item.id },
            OR: [
              { nameSearch: item.nameSearch },
              ...(item.phoneNumber ? [{ phoneNumber: item.phoneNumber }] : []),
            ],
          },
        }),
      ),
    );
    return {
      items: items.map((item, index) => ({
        ...item,
        requestKey: undefined,
        payloadHash: undefined,
        academicYear: undefined,
        academicYearLabel: item.academicYear?.label ?? null,
        requiresAcademicConfirmation: !item.academicYearId || item.academicYearId !== openYear?.id,
        similarRequestCount: similarities[index],
        classroom: item.classroom.name,
        primaryTalent: item.primaryTalent.name,
        additionalTalentIds: item.additionalTalents.map((t) => t.talentId),
        additionalTalents: item.additionalTalents.map((t) => t.talent.name),
        nameSearch: undefined,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
  async function approve(
    id: string,
    submitted: z.infer<typeof registrationApprovalSchema>,
    adminId: string,
  ) {
    return db.$transaction(async (tx) => {
      const year = await lockOpenYear(tx);
      await tx.$queryRaw`SELECT id FROM "RegistrationRequest" WHERE id=${id}::uuid FOR UPDATE`;
      const registration = await tx.registrationRequest.findUnique({ where: { id } });
      if (!registration) throw new AppError(404, 'NOT_FOUND', 'طلب التسجيل غير موجود.');
      if (registration.status === 'APPROVED' && registration.studentId)
        return { studentId: registration.studentId, alreadyProcessed: true };
      if (registration.status !== 'PENDING')
        throw new AppError(409, 'REVIEWED', 'تمت مراجعة هذا الطلب مسبقًا.');
      const hasPlacement = 'student' in submitted;
      if (
        (registration.academicYearId !== year.id &&
          (!hasPlacement || !submitted.confirmAcademicPlacement)) ||
        (hasPlacement && submitted.targetAcademicYearId !== year.id)
      )
        throw new AppError(
          409,
          'REGISTRATION_YEAR',
          'راجع الصف وأكد نقل الطلب إلى السنة المفتوحة الحالية قبل القبول.',
        );
      const input = await resolveStudentSubmission(
        tx,
        hasPlacement ? submitted.student : submitted,
      );
      const student = await tx.student.create({
        data: { ...studentData(input), academicYearId: year.id },
      });
      await tx.registrationRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          studentId: student.id,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
      return { studentId: student.id, alreadyProcessed: false };
    });
  }
  async function reject(id: string, adminId: string) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RegistrationRequest" WHERE id=${id}::uuid FOR UPDATE`;
      const registration = await tx.registrationRequest.findUnique({ where: { id } });
      if (!registration) throw new AppError(404, 'NOT_FOUND', 'طلب التسجيل غير موجود.');
      if (registration.status === 'APPROVED')
        throw new AppError(409, 'REVIEWED', 'لا يمكن رفض طلب معتمد.');
      if (registration.status === 'PENDING')
        await tx.registrationRequest.update({
          where: { id },
          data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: adminId },
        });
    });

    return { message: 'تم رفض الطلب.' };
  }
  return { submit, list, approve, reject };
}
