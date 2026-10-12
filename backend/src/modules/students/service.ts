import { lockStudent } from './repository.js';
import type { z } from 'zod';
import { listQuerySchema, studentSubmissionSchema } from '@quba/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ManagedStorage } from '../../services/storage/base.js';
import { AppError } from '../../lib/errors.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import { studentData, studentView } from './serialization.js';
import { studentRelations, resolveStudentSubmission } from './catalog.js';
import { lockOpenYear, studentScope } from '../academic-years/service.js';

export function createStudentService(db: PrismaClient, storage: ManagedStorage) {
  async function list(query: z.infer<typeof listQuerySchema>) {
    const where = await studentScope(db, query);

    const [items, total, talents] = await db.$transaction([
      db.student.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: studentRelations,
      }),
      db.student.count({ where }),
      db.talent.findMany({
        where: { schoolId: 'school' },
        select: { id: true, name: true, active: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      items: items.map(studentView),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      talents,
    };
  }
  async function get(id: string) {
    const student = await db.student.findUnique({
      where: { id: id },
      include: {
        ...studentRelations,
        cv: true,
        works: { include: { attachments: true }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');

    return studentView(student);
  }
  async function create(submitted: z.infer<typeof studentSubmissionSchema>) {
    const student = await db.$transaction(async (tx) => {
      const year = await lockOpenYear(tx);
      const input = await resolveStudentSubmission(tx, submitted);
      return tx.student.create({
        data: { ...studentData(input), academicYearId: year.id },
        include: studentRelations,
      });
    });

    return studentView(student);
  }
  async function update(id: string, submitted: z.infer<typeof studentSubmissionSchema>) {
    return db.$transaction(async (tx) => {
      await lockOpenYear(tx);
      await lockStudent(tx, id);
      const previous = await tx.student.findUniqueOrThrow({
        where: { id },
        include: studentRelations,
      });
      if (previous.status === 'ARCHIVED' && submitted.grade !== 'THIRD')
        throw new AppError(
          400,
          'ARCHIVED_GRADE',
          'الطالب المؤرشف يبقى في الصف الثالث. استخدم الاستعادة لإعادته للسنة الحالية.',
        );
      const input = await resolveStudentSubmission(tx, submitted, studentView(previous));
      const data = studentData(input);
      return studentView(
        await tx.student.update({
          where: { id },
          data: { ...data, additionalTalents: { deleteMany: {}, ...data.additionalTalents } },
          include: studentRelations,
        }),
      );
    });
  }
  async function restore(id: string) {
    return db.$transaction(async (tx) => {
      const year = await lockOpenYear(tx);
      await lockStudent(tx, id);
      const student = await tx.student.findUniqueOrThrow({ where: { id } });
      if (student.status !== 'ARCHIVED')
        throw new AppError(409, 'NOT_ARCHIVED', 'الطالب نشط بالفعل.');
      return studentView(
        await tx.student.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            archivedAt: null,
            academicYearId: year.id,
            grade: 'THIRD',
            updatedAt: student.updatedAt,
          },
          include: studentRelations,
        }),
      );
    });
  }
  async function remove(id: string) {
    await db.$transaction(async (tx) => {
      // Lock parent so attachment writers cannot race cascading deletion.
      await lockStudent(tx, id);
      const student = await tx.student.findUnique({
        where: { id },
        include: { works: { include: { attachments: true } } },
      });
      if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
      await enqueueDeletion(
        tx,
        student.works.flatMap((work) => work.attachments.map((file) => file.storageKey)),
      );
      await tx.student.delete({ where: { id } });
    });

    await storage.maintain(db).catch(() => {});

    return;
  }
  return { list, get, create, update, restore, remove };
}
