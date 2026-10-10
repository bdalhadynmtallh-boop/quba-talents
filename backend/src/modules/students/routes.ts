import type { FastifyInstance } from 'fastify';
import { listQuerySchema, studentSubmissionSchema } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { paramId } from '../../lib/params.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import { studentData, studentView } from './serialization.js';
import { studentRelations, resolveStudentSubmission } from './catalog.js';
import { lockOpenYear, studentScope } from '../academic-years/service.js';
export async function studentRoutes(app: FastifyInstance) {
  const protectedRoute = { preHandler: app.requireAdmin };
  app.get('/students', protectedRoute, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where = await studentScope(app.db, query);
    const [items, total, talents] = await app.db.$transaction([
      app.db.student.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: studentRelations,
      }),
      app.db.student.count({ where }),
      app.db.talent.findMany({
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
  });
  app.get('/students/:studentId', protectedRoute, async (request) => {
    const student = await app.db.student.findUnique({
      where: { id: paramId(request.params, 'studentId') },
      include: {
        ...studentRelations,
        cv: true,
        works: { include: { attachments: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
    return studentView(student);
  });
  app.post('/students', protectedRoute, async (request, reply) => {
    const submitted = studentSubmissionSchema.parse(request.body);
    const student = await app.db.$transaction(async (tx) => {
      const year = await lockOpenYear(tx);
      const input = await resolveStudentSubmission(tx, submitted);
      return tx.student.create({
        data: { ...studentData(input), academicYearId: year.id },
        include: studentRelations,
      });
    });
    return reply.code(201).send(studentView(student));
  });
  app.put('/students/:studentId', protectedRoute, async (request) => {
    const submitted = studentSubmissionSchema.parse(request.body);
    const id = paramId(request.params, 'studentId');
    return app.db.$transaction(async (tx) => {
      await lockOpenYear(tx);
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
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
  });
  app.post('/students/:studentId/restore', protectedRoute, async (request) => {
    const id = paramId(request.params, 'studentId');
    return app.db.$transaction(async (tx) => {
      const year = await lockOpenYear(tx);
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
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
  });
  app.delete('/students/:studentId', protectedRoute, async (request, reply) => {
    const id = paramId(request.params, 'studentId');
    await app.db.$transaction(async (tx) => {
      // Lock parent so attachment writers cannot race cascading deletion.
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
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
    await app.storage.maintain(app.db).catch(() => {});
    return reply.code(204).send();
  });
}
