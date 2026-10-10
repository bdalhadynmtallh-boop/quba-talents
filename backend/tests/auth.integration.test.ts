import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { hashPassword } from '../src/lib/password.js';
import type { Environment } from '../src/config/env.js';
import { testDefaults } from './env.js';
class TestClient {
  private cookies = new Map<string, string>();
  constructor(
    private app: FastifyInstance,
    private origin: string,
  ) {}
  async request(options: InjectOptions) {
    const response = await this.app.inject({
      ...options,
      headers: {
        cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...options.headers,
      },
    });
    for (const cookie of response.cookies) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }
  async post(url: string, payload?: Record<string, string>) {
    const csrf = await this.request({ url: '/api/auth/csrf' });
    return this.request({
      method: 'POST',
      url,
      payload,
      headers: { origin: this.origin, 'x-csrf-token': csrf.json<{ token: string }>().token },
    });
  }
}
const url = process.env.TEST_DATABASE_URL;
test(
  'PostgreSQL auth lifecycle, privacy, expiry, logout and planned boundaries',
  { skip: !url },
  async (t) => {
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('TEST_DATABASE_URL must name a dedicated *_test database.');
    const env: Environment = {
      ...testDefaults,
      DATABASE_URL: url,
      COOKIE_SECRET: randomBytes(32).toString('hex'),
      NODE_ENV: 'test',
      APP_ORIGIN: 'http://localhost:5173',
      HOST: '127.0.0.1',
      PORT: 3001,
      SESSION_HOURS: 8,
      STORAGE_DIR: `.data/auth-test-${randomBytes(8).toString('hex')}`,
    };
    const db = createDatabase(url);
    const password = randomBytes(24).toString('hex');
    const admin = await db.admin.create({
      data: {
        email: `test-${randomBytes(8).toString('hex')}@example.test`,
        name: 'مسؤول اختبار',
        passwordHash: await hashPassword(password),
      },
    });
    t.after(async () => {
      await db.admin.deleteMany({ where: { id: admin.id } });
      await db.$disconnect();
    });
    const app = await buildApp(env);
    t.after(() => app.close());
    const client = new TestClient(app, env.APP_ORIGIN);
    assert.equal((await client.request({ url: '/health' })).statusCode, 200);
    assert.equal(
      (await client.request({ url: '/health/ready' })).json<{ database: string }>().database,
      'connected',
    );
    assert.equal(
      (await client.request({ url: '/api/auth/session' })).json<{ admin: null }>().admin,
      null,
    );
    assert.equal((await client.request({ url: '/api/students' })).statusCode, 401);
    assert.equal((await client.request({ url: '/api/students/some-id' })).statusCode, 401);
    assert.equal((await client.request({ url: '/api/registrations' })).statusCode, 401);
    assert.equal((await client.post('/api/students')).statusCode, 401);
    assert.equal((await client.post('/api/registrations', { name: 'طالب' })).statusCode, 400);
    const invalid = await client.post('/api/auth/login', { email: admin.email, password: 'wrong' });
    assert.equal(invalid.statusCode, 401);
    const unknown = await client.post('/api/auth/login', {
      email: 'unknown@example.test',
      password: 'wrong',
    });
    assert.equal(unknown.statusCode, 401);
    assert.deepEqual(invalid.json(), unknown.json());
    const login = await client.post('/api/auth/login', { email: admin.email, password });
    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers['set-cookie']);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/i);
    const identity = login.json<{ admin: { id: string; passwordHash?: string } }>().admin;
    assert.equal(identity.id, admin.id);
    assert.equal(identity.passwordHash, undefined);
    const oldSession = await db.session.findFirstOrThrow({ where: { adminId: admin.id } });
    assert.equal(oldSession.tokenHash.length, 64);
    assert.equal(
      (await client.request({ url: '/api/auth/session' })).json<{ admin: { id: string } }>().admin
        .id,
      admin.id,
    );
    assert.equal((await client.request({ url: '/api/students' })).statusCode, 200);
    const rotated = await client.post('/api/auth/login', { email: admin.email, password });
    assert.equal(rotated.statusCode, 200);
    assert.equal(await db.session.findUnique({ where: { id: oldSession.id } }), null);
    const logout = await client.post('/api/auth/logout');
    assert.equal(logout.statusCode, 204);
    assert.equal(await db.session.count({ where: { adminId: admin.id } }), 0);
    assert.equal((await client.request({ url: '/api/students' })).statusCode, 401);
    assert.equal(
      (await client.post('/api/auth/login', { email: admin.email, password })).statusCode,
      200,
    );
    await db.session.updateMany({
      where: { adminId: admin.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await client.request({ url: '/api/students' })).statusCode, 401);
    assert.equal(
      (await client.request({ url: '/api/auth/session' })).json<{ admin: null }>().admin,
      null,
    );
  },
);
test('Login limits brute force attempts', { skip: !url }, async (t) => {
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use dedicated test DB');
  const env: Environment = {
    ...testDefaults,
    DATABASE_URL: url,
    COOKIE_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:5173',
    HOST: '127.0.0.1',
    PORT: 3001,
    SESSION_HOURS: 8,
    STORAGE_DIR: `.data/auth-test-${randomBytes(8).toString('hex')}`,
  };
  const app = await buildApp(env);
  t.after(() => app.close());
  const client = new TestClient(app, env.APP_ORIGIN);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await client.post('/api/auth/login', { email: 'unknown@example.test', password: 'wrong' }))
        .statusCode,
      401,
    );
  assert.equal(
    (await client.post('/api/auth/login', { email: 'unknown@example.test', password: 'wrong' }))
      .statusCode,
    429,
  );
});
