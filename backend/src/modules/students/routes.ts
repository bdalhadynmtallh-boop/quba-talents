import type { FastifyInstance } from 'fastify';
import { listQuerySchema, studentSchema } from '@quba/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { paramId } from '../../lib/params.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import { studentData, studentView } from './serialization.js';
export async function studentRoutes(app: FastifyInstance) {
  const protectedRoute = { preHandler: app.requireAdmin };
  app.get('/students', protectedRoute, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.StudentWhereInput = {
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.grade ? { grade: query.grade } : {}),
      ...(query.talent ? { primaryTalent: query.talent } : {}),
    };
    const [items, total, talents] = await app.db.$transaction([
      app.db.student.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      app.db.student.count({ where }),
      app.db.student.findMany({
        distinct: ['primaryTalent'],
        select: { primaryTalent: true },
        orderBy: { primaryTalent: 'asc' },
      }),
    ]);
    return {
      items: items.map(studentView),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      talents: talents.map((item) => item.primaryTalent),
    };
  });
  app.get('/students/:studentId', protectedRoute, async (request) => {
    const student = await app.db.student.findUnique({
      where: { id: paramId(request.params, 'studentId') },
      include: {
        cv: true,
        works: { include: { attachments: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
    return studentView(student);
  });
  app.post('/students', protectedRoute, async (request, reply) => {
    const input = studentSchema.parse(request.body);
    return reply
      .code(201)
      .send(studentView(await app.db.student.create({ data: studentData(input) })));
  });
  app.put('/students/:studentId', protectedRoute, async (request) => {
    const input = studentSchema.parse(request.body);
    return studentView(
      await app.db.student.update({
        where: { id: paramId(request.params, 'studentId') },
        data: studentData(input),
      }),
    );
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
