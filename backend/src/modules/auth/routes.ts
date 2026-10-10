import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@quba/shared';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, hashToken, newToken, verifyPassword } from '../../lib/password.js';
import { cookieNames, cookieOptions, csrfToken } from '../../plugins/security.js';
export async function authRoutes(app: FastifyInstance, env: Environment) {
  // Same cost for missing accounts; never reveal whether an email exists.
  const dummyHash = await hashPassword(newToken());
  app.get('/auth/csrf', async (request, reply) => ({ token: csrfToken(request, reply, env) }));
  app.get('/auth/session', async (request) => ({ admin: request.admin }));
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const admin = await app.db.admin.findUnique({ where: { email: input.email } });
      const valid = await verifyPassword(input.password, admin?.passwordHash ?? dummyHash);
      if (!admin || !valid)
        throw new AppError(
          401,
          'INVALID_CREDENTIALS',
          'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
        );
      const token = newToken();
      const expiresAt = new Date(Date.now() + env.SESSION_HOURS * 3600000);
      const identity = { id: admin.id, name: admin.name, email: admin.email };
      await app.db.$transaction(async (tx) => {
        if (request.sessionId) await tx.session.deleteMany({ where: { id: request.sessionId } });
        await tx.session.deleteMany({
          where: { adminId: admin.id, expiresAt: { lte: new Date() } },
        });
        await tx.session.create({
          data: { adminId: admin.id, tokenHash: hashToken(token), expiresAt },
        });
      });
      reply.setCookie(cookieNames(env).session, token, {
        ...cookieOptions(env),
        expires: expiresAt,
      });
      reply.clearCookie(cookieNames(env).csrf, cookieOptions(env));
      return { admin: identity };
    },
  );
  app.post('/auth/logout', { preHandler: app.requireAdmin }, async (request, reply) => {
    await app.db.session.deleteMany({ where: { id: request.sessionId ?? '' } });
    reply.clearCookie(cookieNames(env).session, cookieOptions(env));
    reply.clearCookie(cookieNames(env).csrf, cookieOptions(env));
    return reply.code(204).send();
  });
}
