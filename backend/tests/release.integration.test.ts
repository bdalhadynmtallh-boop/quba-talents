import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { createRegistrationService } from '../src/modules/registrations/service.js';
import { createCvService } from '../src/modules/cv/service.js';
import { aiInput } from '../src/services/ai/qwen.js';
import { testCatalog } from './catalog.js';
import { requireTestDatabaseUrl } from './isolation.js';
import { testDefaults } from './env.js';
import { FakeTextAi } from './fake-ai.js';
import { TestClient } from './client.js';
import { hashPassword } from '../src/lib/password.js';
test(
  'Release: registration consistency, review audit, privacy and Arabic payloads',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL),
      db = createDatabase(url),
      prefix = `release-${randomUUID()}`;
    const catalog = await testCatalog(db),
      password = randomUUID();
    const admin = await db.admin.create({
      data: {
        email: `${prefix}@example.test`,
        name: 'مراجع اختبار',
        passwordHash: await hashPassword(password),
      },
    });
    const env = {
      ...testDefaults,
      NODE_ENV: 'test' as const,
      DATABASE_URL: url,
      COOKIE_SECRET: randomUUID() + randomUUID(),
      APP_ORIGIN: 'http://localhost:5173',
      HOST: '127.0.0.1',
      PORT: 3001,
      SESSION_HOURS: 8,
      STORAGE_DIR: resolve('.data', prefix),
    };
    const ai = new FakeTextAi(),
      app = await buildApp(env, { ai, pdf: { render: async () => Buffer.from('%PDF') } }),
      client = new TestClient(app, env.APP_ORIGIN);
    const service = createRegistrationService(db),
      cv = createCvService(db, app.storage, env, {
        ai,
        pdf: { render: async () => Buffer.from('%PDF') },
      });
    const registration = {
      name: prefix,
      phoneNumber: '0501234567',
      grade: 'FIRST' as const,
      classroomId: catalog.classroom.id,
      primaryTalentId: catalog.programming.id,
      additionalTalentIds: [],
      description: 'اهتمام موثق بالبرمجة التعليمية',
    };
    const input = {
      ...registration,
      skills: [],
      achievements: [],
      notes: '',
      supervisorOverrides: null,
    };
    const { description: _description, ...student } = input;
    void _description;
    t.after(async () => {
      await app.close();
      await db.registrationRequest.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.student.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.admin.delete({ where: { id: admin.id } });
      await db.$disconnect();
    });
    assert.equal(
      (await client.post('/api/auth/login', { email: admin.email, password })).statusCode,
      200,
    );
    let requestId = '',
      studentId = '';
    await t.test(
      'Concurrent retries create one request, changed contents conflict, shared phones remain valid',
      async () => {
        const key = randomUUID();
        await Promise.all([service.submit(registration, key), service.submit(registration, key)]);
        const requests = await db.registrationRequest.findMany({ where: { requestKey: key } });
        assert.equal(requests.length, 1);
        assert.equal(requests[0]!.academicYearId, catalog.year.id);
        requestId = requests[0]!.id;
        await assert.rejects(
          service.submit({ ...registration, description: 'محتوى مختلف موثق' }, key),
          { code: 'REQUEST_KEY_REUSED' },
        );
        await service.submit({ ...registration, name: `${prefix}-other` }, randomUUID());
        const list = await service.list({ page: 1, pageSize: 50, status: 'PENDING' });
        assert.ok((list.items.find((r) => r.id === requestId)!.similarRequestCount ?? 0) >= 1);
      },
    );
    await t.test(
      'Unknown submission year requires explicit placement; acceptance retry is stable',
      async () => {
        await db.registrationRequest.update({
          where: { id: requestId },
          data: { academicYearId: null },
        });
        await assert.rejects(service.approve(requestId, student, admin.id), {
          code: 'REGISTRATION_YEAR',
        });
        const approved = await service.approve(
          requestId,
          { student, targetAcademicYearId: catalog.year.id, confirmAcademicPlacement: true },
          admin.id,
        );
        studentId = approved.studentId;
        assert.equal((await service.approve(requestId, student, admin.id)).studentId, studentId);
      },
    );
    await t.test(
      'Approval requires student review, records reviewer/revision and conflicts after edits',
      async () => {
        const draft = await cv.generate(studentId, 0);
        assert.equal(
          (await client.post(`/api/students/${studentId}/cv/approve`, { revision: draft.revision }))
            .statusCode,
          400,
        );
        const state = await cv.approve(studentId, draft.revision, admin.id);
        assert.equal(state.latestReview?.reviewerName, admin.name);
        assert.equal(state.latestReview?.revision, draft.revision);
        assert.equal(state.legacyApproval, false);
        await assert.rejects(cv.approve(studentId, draft.revision, admin.id), {
          code: 'CV_CONFLICT',
        });
        await db.cvReview.deleteMany({ where: { cv: { studentId } } });
        assert.equal((await cv.state(studentId)).legacyApproval, true);
      },
    );
    await t.test(
      'External AI input removes known identities, phones, emails and URLs',
      async () => {
        await db.student.update({
          where: { id: studentId },
          data: { notes: `${prefix} 0501234567 student@example.test https://example.test/private` },
        });
        const text = JSON.stringify(aiInput(await cv.getSource(studentId)));
        assert.ok(!text.includes(prefix));
        assert.ok(!text.includes('0501234567'));
        assert.ok(!text.includes('student@example.test'));
        assert.ok(!text.includes('https://example.test'));
      },
    );
    await t.test(
      'Valid long Arabic student bodies are accepted without relaxing other routes',
      async () => {
        const large = {
          ...student,
          name: `${prefix}-long`,
          notes: 'ع'.repeat(5000),
          achievements: Array.from({ length: 30 }, () => ({ title: 'ع'.repeat(500), date: null })),
          skills: Array.from({ length: 30 }, () => 'ع'.repeat(120)),
        };
        assert.ok(Buffer.byteLength(JSON.stringify(large)) > 32768);
        const result = await client.post('/api/students', large);
        assert.equal(result.statusCode, 201, result.body);
      },
    );
    await t.test(
      'Deleting linked student preserves acceptance with a dated deletion event',
      async () => {
        assert.equal((await client.mutate('DELETE', `/api/students/${studentId}`)).statusCode, 204);
        const request = await db.registrationRequest.findUniqueOrThrow({
          where: { id: requestId },
        });
        assert.equal(request.status, 'APPROVED');
        assert.equal(request.studentId, null);
        assert.ok(request.studentDeletedAt);
        await assert.rejects(service.approve(requestId, student, admin.id), { code: 'REVIEWED' });
      },
    );
  },
);
