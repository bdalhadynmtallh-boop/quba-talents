import type { FastifyInstance } from 'fastify';
import { registrationSchema, registrationQuerySchema, studentSchema } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { paramId } from '../../lib/params.js';
import { studentData } from '../students/serialization.js';
export async function registrationRoutes(app: FastifyInstance) {
  app.post(
    '/registrations',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = registrationSchema.parse(request.body);
      await app.db.registrationRequest.create({ data: input });
      return reply
        .code(201)
        .send({ message: 'وصل طلب تسجيل موهبتك بنجاح. سيقوم المسؤول بمراجعته.' });
    },
  );
  app.get('/registrations', { preHandler: app.requireAdmin }, async (request) => {
    const query = registrationQuerySchema.parse(request.query);
    const where = { status: query.status };
    const [items, total] = await app.db.$transaction([
      app.db.registrationRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      app.db.registrationRequest.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  });
  app.post('/registrations/:id/approve', { preHandler: app.requireAdmin }, async (request) => {
    const id = paramId(request.params, 'id');
    const input = studentSchema.parse(request.body);
    return app.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RegistrationRequest" WHERE id=${id}::uuid FOR UPDATE`;
      const registration = await tx.registrationRequest.findUnique({ where: { id } });
      if (!registration) throw new AppError(404, 'NOT_FOUND', 'طلب التسجيل غير موجود.');
      if (registration.status === 'APPROVED' && registration.studentId)
        return { studentId: registration.studentId, alreadyProcessed: true };
      if (registration.status !== 'PENDING')
        throw new AppError(409, 'REVIEWED', 'تمت مراجعة هذا الطلب مسبقًا.');
      const student = await tx.student.create({ data: studentData(input) });
      await tx.registrationRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          studentId: student.id,
          reviewedAt: new Date(),
          reviewedById: request.admin!.id,
        },
      });
      return { studentId: student.id, alreadyProcessed: false };
    });
  });
  app.post('/registrations/:id/reject', { preHandler: app.requireAdmin }, async (request) => {
    const id = paramId(request.params, 'id');
    await app.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RegistrationRequest" WHERE id=${id}::uuid FOR UPDATE`;
      const registration = await tx.registrationRequest.findUnique({ where: { id } });
      if (!registration) throw new AppError(404, 'NOT_FOUND', 'طلب التسجيل غير موجود.');
      if (registration.status === 'APPROVED')
        throw new AppError(409, 'REVIEWED', 'لا يمكن رفض طلب معتمد.');
      if (registration.status === 'PENDING')
        await tx.registrationRequest.update({
          where: { id },
          data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: request.admin!.id },
        });
    });
    return { message: 'تم رفض الطلب.' };
  });
}
