import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { equalTokens, newToken } from '../lib/password.js';
export function cookieNames(env: Environment) {
  const prefix = env.NODE_ENV === 'production' ? '__Host-' : '';
  return { session: `${prefix}quba_session`, csrf: `${prefix}quba_csrf` };
}
export function cookieOptions(env: Environment) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    signed: true,
  };
}
export function csrfToken(request: FastifyRequest, reply: FastifyReply, env: Environment) {
  const name = cookieNames(env).csrf;
  const cookieValue = request.cookies[name];
  const verified = cookieValue ? request.unsignCookie(cookieValue) : null;
  const token = verified?.valid && verified.value ? verified.value : newToken();
  reply.setCookie(name, token, { ...cookieOptions(env), maxAge: env.SESSION_HOURS * 3600 });
  return token;
}
export const securityPlugin = fp<{ env: Environment }>(async (app, { env }) => {
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    if (request.headers.origin !== env.APP_ORIGIN)
      throw new AppError(403, 'CSRF_ORIGIN', 'مصدر الطلب غير مسموح.');
    const cookieValue = request.cookies[cookieNames(env).csrf];
    const verified = cookieValue ? request.unsignCookie(cookieValue) : null;
    const header = request.headers['x-csrf-token'];
    if (
      !verified?.valid ||
      !verified.value ||
      typeof header !== 'string' ||
      !equalTokens(header, verified.value)
    )
      throw new AppError(403, 'CSRF_TOKEN', 'انتهت صلاحية حماية الطلب. حدّث الصفحة وحاول مجددًا.');
  });
});
