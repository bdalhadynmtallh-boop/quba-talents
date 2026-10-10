import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { securityPlugin } from '../src/plugins/security.js';
import { registerErrorHandler } from '../src/lib/errors.js';
import { csrfToken } from '../src/plugins/security.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { loginSchema, registrationSchema } from '@quba/shared';
import type { Environment } from '../src/config/env.js';
const env: Environment = {
  STORAGE_PROVIDER: 'local',
  SUPABASE_STORAGE_BUCKET: 'quba-private',
  AI_BASE_URL: '',
  AI_MODEL: 'qwen3.8-max',
  AI_TIMEOUT_MS: 60000,
  AI_OUTPUT_MODE: 'auto',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/test',
  COOKIE_SECRET: randomBytes(32).toString('hex'),
  APP_ORIGIN: 'http://localhost:5173',
  HOST: '127.0.0.1',
  PORT: 3001,
  SESSION_HOURS: 8,
  STORAGE_DIR: ' .data/security-test',
};
test('Password hashing uses a random salt and rejects wrong passwords', async () => {
  const password = randomBytes(20).toString('hex');
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword('incorrect', first), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
});
test('Shared schemas reject extra personal data and malformed login input', () => {
  assert.equal(loginSchema.safeParse({ email: 'bad', password: 'x' }).success, false);
  const form = {
    name: 'طالب تجريبي',
    grade: 'SECOND',
    classroomId: '00000000-0000-4000-8000-000000000001',
    primaryTalentId: '00000000-0000-4000-8000-000000000002',
    description: 'وصف تجريبي للموهبة',
  };
  assert.equal(registrationSchema.safeParse(form).success, true);
  assert.equal(registrationSchema.safeParse({ ...form, nationalId: 'unnecessary' }).success, false);
});
test('HTTP CSRF rejects missing/tampered tokens and foreign or missing origins', async (t) => {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(securityPlugin, { env });
  app.get('/csrf', async (request, reply) => ({ token: csrfToken(request, reply, env) }));
  app.post('/write', async (_request, reply) => reply.code(201).send({ ok: true }));
  t.after(() => app.close());
  const initial = await app.inject({ url: '/csrf' });
  const body = initial.json<{ token: string }>();
  const setCookie = initial.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');
  const cookie = String(setCookie).split(';')[0]!;
  assert.match(String(setCookie), /HttpOnly/);
  assert.match(String(setCookie), /SameSite=Strict/i);
  for (const headers of [
    { origin: env.APP_ORIGIN },
    { cookie, origin: env.APP_ORIGIN, 'x-csrf-token': 'tampered' },
    { cookie, origin: 'https://untrusted.example', 'x-csrf-token': body.token },
    { cookie, 'x-csrf-token': body.token },
    { cookie: cookie + 'tampered', origin: env.APP_ORIGIN, 'x-csrf-token': body.token },
  ]) {
    const result = await app.inject({ method: 'POST', url: '/write', headers });
    assert.equal(result.statusCode, 403);
    assert.ok(result.json<{ message: string }>().message);
  }
  const allowed = await app.inject({
    method: 'POST',
    url: '/write',
    headers: { cookie, origin: env.APP_ORIGIN, 'x-csrf-token': body.token },
  });
  assert.equal(allowed.statusCode, 201);
});
test('Production CSRF cookie is Secure, HttpOnly and host scoped', async (t) => {
  const app = Fastify();
  const production = {
    ...env,
    NODE_ENV: 'production' as const,
    APP_ORIGIN: 'https://school.example',
  };
  registerErrorHandler(app);
  await app.register(securityPlugin, { env: production });
  app.get('/csrf', async (request, reply) => ({ token: csrfToken(request, reply, production) }));
  t.after(() => app.close());
  const response = await app.inject('/csrf');
  const cookie = String(response.headers['set-cookie']);
  assert.match(cookie, /__Host-quba_csrf=/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
});
