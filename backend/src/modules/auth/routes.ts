import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@quba/shared';
import type { Environment } from '../../config/env.js';
import { cookieNames, cookieOptions, csrfToken } from '../../plugins/security.js';
import { createAuthService } from './service.js';
export async function authRoutes(app: FastifyInstance, env: Environment) {
  const auth = await createAuthService(app.db, env.SESSION_HOURS);
  app.get('/auth/csrf', async (request, reply) => ({ token: csrfToken(request, reply, env) }));
  app.get('/auth/session', async (request) => ({ admin: request.admin }));
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { identity, token, expiresAt } = await auth.login(
        loginSchema.parse(request.body),
        request.sessionId,
      );

      reply.setCookie(cookieNames(env).session, token, {
        ...cookieOptions(env),
        expires: expiresAt,
      });

      reply.clearCookie(cookieNames(env).csrf, cookieOptions(env));

      return { admin: identity };
    },
  );
  app.post('/auth/logout', { preHandler: app.requireAdmin }, async (request, reply) => {
    await auth.logout(request.sessionId);
    reply.clearCookie(cookieNames(env).session, cookieOptions(env));
    reply.clearCookie(cookieNames(env).csrf, cookieOptions(env));
    return reply.code(204).send();
  });
}
