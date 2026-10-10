import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ code: 'INVALID_INPUT', message: 'يرجى التحقق من البيانات المدخلة.' });
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'P2025')
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'السجل المطلوب غير موجود.' });
      if (error.code === 'P2002' || error.code === 'P2003')
        return reply
          .code(409)
          .send({ code: 'CONFLICT', message: 'تعارض في البيانات. حدّث الصفحة وحاول مجددًا.' });
      if (
        typeof error.code === 'string' &&
        error.code.startsWith('FST_') &&
        error.code.includes('LIMIT')
      )
        return reply.code(413).send({
          code: 'FILE_LIMIT',
          message: 'تجاوز الرفع حد الحجم أو العدد المسموح (10 ميغابايت و6 مرفقات).',
        });
    }
    const status =
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status === 429)
      return reply
        .code(429)
        .send({ code: 'RATE_LIMIT', message: 'محاولات كثيرة. يرجى الانتظار ثم المحاولة مجددًا.' });
    if (status >= 400 && status < 500)
      return reply
        .code(status)
        .send({ code: 'BAD_REQUEST', message: 'تعذر معالجة الطلب. تحقق من صيغته وحجمه.' });
    // Error messages from database or providers can contain student input or secrets.
    request.log.error({ code: 'INTERNAL_ERROR', requestId: request.id }, 'Request failed');
    return reply
      .code(500)
      .send({ code: 'INTERNAL_ERROR', message: 'تعذر إكمال العملية. حاول مرة أخرى لاحقًا.' });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ code: 'NOT_FOUND', message: 'المسار المطلوب غير موجود.' }),
  );
}
