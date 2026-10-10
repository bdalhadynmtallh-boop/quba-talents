import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminIdentity } from '@quba/shared';
import type { Environment } from '../config/env.js';
import { hashToken } from '../lib/password.js';
import { AppError } from '../lib/errors.js';
import { cookieNames, cookieOptions } from './security.js';
declare module 'fastify' {
  interface FastifyRequest {
    admin: AdminIdentity | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
export const authPlugin = fp<{ env: Environment }>(async (app, { env }) => {
  app.decorateRequest('admin', null);
  app.decorateRequest('sessionId', null);
  app.addHook('preHandler', async (request, reply) => {
    const raw = request.cookies[cookieNames(env).session];
    if (!raw) return;
    const verified = request.unsignCookie(raw);
    if (!verified.valid || !verified.value) return;
    const session = await app.db.session.findUnique({
      where: { tokenHash: hashToken(verified.value) },
      include: { admin: { select: { id: true, name: true, email: true } } },
    });
    if (!session || session.expiresAt <= new Date()) {
      reply.clearCookie(cookieNames(env).session, cookieOptions(env));
      return;
    }
    request.admin = session.admin;
    request.sessionId = session.id;
  });
  app.decorate('requireAdmin', async (request: FastifyRequest) => {
    if (!request.admin)
      throw new AppError(401, 'UNAUTHORIZED', 'يلزم تسجيل دخول المسؤول للوصول إلى ملفات الطلاب.');
  });
});
