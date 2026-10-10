import { testCatalog } from './catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { cvSchema, type CvState, type StudentView } from '@quba/shared';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { hashPassword } from '../src/lib/password.js';
import { TestClient } from './client.js';
import { testDefaults } from './env.js';
import { FakeTextAi } from './fake-ai.js';
import { printTemplate } from '../src/services/pdf/template.js';
const url = process.env.TEST_DATABASE_URL;
test(
  'Part 3: persisted draft/approval, concurrency, privacy and real Chromium PDF',
  { skip: !url },
  async (t) => {
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('Dedicated *_test database required');
    const prefix = `cv-${randomUUID()}`,
      storageRoot = resolve('.data', prefix);
    const db = createDatabase(url),
      password = randomBytes(20).toString('hex');
    const catalog = await testCatalog(db);
    const admin = await db.admin.create({
      data: {
        email: `${prefix}@example.test`,
        name: 'مسؤول اختبار',
        passwordHash: await hashPassword(password),
      },
    });
    const env = {
      ...testDefaults,
      NODE_ENV: 'test' as const,
      DATABASE_URL: url,
      COOKIE_SECRET: randomBytes(32).toString('hex'),
      APP_ORIGIN: 'http://localhost:5173',
      HOST: '127.0.0.1',
      PORT: 3001,
      SESSION_HOURS: 8,
      STORAGE_DIR: storageRoot,
    };
    const fake = new FakeTextAi();
    let mode = 'normal',
      release: (() => void) | undefined;
    const ai = {
      generate: async (input: Parameters<FakeTextAi['generate']>[0]) => {
        if (mode === 'fail') throw new Error('Provider failure');
        if (mode === 'slow')
          await new Promise<void>((done) => {
            release = done;
          });
        return fake.generate(input);
      },
    };
    let app = await buildApp(env, { ai });
    const client = new TestClient(app, env.APP_ORIGIN),
      guest = new TestClient(app, env.APP_ORIGIN);
    t.after(async () => {
      release?.();
      await app.close();
      await db.registrationRequest.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.student.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.admin.delete({ where: { id: admin.id } });
      await db.$disconnect();
      if (!storageRoot.startsWith(resolve('.data') + sep)) throw new Error('Unsafe path');
      await rm(storageRoot, { recursive: true, force: true });
    });
    assert.equal(
      (await client.post('/api/auth/login', { email: admin.email, password })).statusCode,
      200,
    );
    const input = {
      name: `${prefix} أحمد`,
      grade: 'SECOND',
      classroomId: catalog.classroom.id,
      primaryTalentId: catalog.programming.id,
      skills: ['تطوير المواقع'],
      notes: 'نفّذ موقعًا تعليميًا.',
      achievements: [{ title: 'المشاركة في معرض المدرسة', date: '2026-03-01' }],
    };
    let id = '',
      revision = 0,
      approved: unknown;
    const get = async () =>
      (await client.request({ url: `/api/students/${id}/cv` })).json<CvState>();
    let address = 1;
    const generate = async () =>
      client.request({
        method: 'POST',
        url: `/api/students/${id}/cv/generate`,
        payload: { revision },
        headers: await client.csrf(),
        remoteAddress: `127.0.1.${address++}`,
      });
    await t.test(
      'Registration approval and generation produce an actual persisted draft',
      async () => {
        assert.equal(
          (
            await guest.post('/api/registrations', {
              name: input.name,
              grade: input.grade,
              classroomId: input.classroomId,
              primaryTalentId: input.primaryTalentId,
              description: input.notes,
            })
          ).statusCode,
          201,
        );
        const reg = await db.registrationRequest.findFirstOrThrow({ where: { name: input.name } });
        const accepted = await client.post(`/api/registrations/${reg.id}/approve`, input);
        id = accepted.json<{ studentId: string }>().studentId;
        assert.equal((await client.mutate('PUT', `/api/students/${id}`, input)).statusCode, 200);
        assert.equal(
          (
            await client.post(`/api/students/${id}/works`, {
              title: 'موقع المراجعة',
              description: 'مشروع تعليمي',
              studentRole: 'برمجة الواجهة',
              date: null,
            })
          ).statusCode,
          201,
        );
        assert.equal((await get()).draft, null);
        const response = await generate();
        assert.equal(response.statusCode, 200, response.body);
        const state = response.json<CvState>();
        assert.equal(state.draft?.projects.length, 1);
        assert.equal(state.approved, null);
        revision = state.revision;
        assert.ok((await db.studentCv.findUniqueOrThrow({ where: { studentId: id } })).draft);
      },
    );
    await t.test(
      'Editing and approval retain approved content across regeneration and stale source changes',
      async () => {
        const initial = (await get()).draft!;
        const saved = await client.mutate('PUT', `/api/students/${id}/cv/draft`, {
          revision,
          content: { ...initial, summary: 'نبذة راجعها المسؤول عن مشروع الطالب التعليمي.' },
        });
        assert.equal(saved.statusCode, 200, saved.body);
        revision = saved.json<CvState>().revision;
        assert.equal(
          (
            await client.mutate('PUT', `/api/students/${id}/cv/draft`, {
              revision: revision - 1,
              content: initial,
            })
          ).statusCode,
          409,
        );
        const accepted = await client.post(`/api/students/${id}/cv/approve`, { revision });
        assert.equal(accepted.statusCode, 200, accepted.body);
        revision = accepted.json<CvState>().revision;
        approved = accepted.json<CvState>().approved;
        assert.equal(
          (
            await client.mutate('PUT', `/api/students/${id}`, {
              ...input,
              notes: 'معلومات محدثة موثقة.',
            })
          ).statusCode,
          200,
        );
        assert.equal((await get()).approvedStale, true);
        assert.equal(
          (await client.post(`/api/students/${id}/cv/approve`, { revision })).statusCode,
          409,
        );
        const response = await generate();
        assert.equal(response.statusCode, 200, response.body);
        revision = response.json<CvState>().revision;
        assert.deepEqual(response.json<CvState>().approved, approved);
        assert.equal(response.json<CvState>().draftStale, false);
      },
    );
    await t.test(
      'Duplicate generation and changed sources do not save partial or obsolete drafts',
      async () => {
        const before = (await get()).draft;
        mode = 'slow';
        const first = generate();
        for (let i = 0; i < 100 && !release; i++) await new Promise((done) => setTimeout(done, 10));
        assert.ok(release);
        assert.equal((await generate()).statusCode, 409);
        await client.mutate('PUT', `/api/students/${id}`, {
          ...input,
          notes: 'بيانات تغيرت أثناء الطلب.',
        });
        release!();
        assert.equal((await first).statusCode, 409);
        release = undefined;
        mode = 'fail';
        assert.equal((await generate()).statusCode, 500);
        assert.deepEqual((await get()).draft, before);
        assert.equal((await get()).generating, false);
        mode = 'normal';
      },
    );
    await t.test(
      'CV reads, editing, generation, approval and exports require authentication',
      async () => {
        for (const [method, path] of [
          ['GET', `/api/students/${id}/cv`],
          ['GET', `/api/students/${id}/cv/pdf`],
          ['POST', `/api/students/${id}/cv/generate`],
          ['PUT', `/api/students/${id}/cv/draft`],
          ['POST', `/api/students/${id}/cv/approve`],
          ['POST', '/api/cv/export'],
        ] as const) {
          const result = await guest.request({
            method,
            url: path,
            headers: method === 'GET' ? {} : await guest.csrf(),
          });
          assert.equal(result.statusCode, 401, result.body);
        }
      },
    );
    await t.test(
      'Reopening preserves approval; individual and batch PDF never call AI',
      async () => {
        const count = fake.calls;
        await app.close();
        app = await buildApp(env, { ai });
        client.app = app;
        assert.deepEqual((await get()).approved, approved);
        const pdf = await client.request({ url: `/api/students/${id}/cv/pdf` });
        assert.equal(pdf.statusCode, 200, pdf.body.slice(0, 100));
        assert.match(String(pdf.headers['content-type']), /application\/pdf/);
        const root = resolve('docs/pdf');
        await mkdir(root, { recursive: true });
        await writeFile(resolve(root, 'single-short.pdf'), pdf.rawPayload);
        // The new development sections add a second page to this fixture.
        assert.equal((await PDFDocument.load(pdf.rawPayload)).getPageCount(), 2);
        const second = (
          await client.post('/api/students', { ...input, name: `${prefix} عمر` })
        ).json<StudentView>();
        const source = (await get()).approved!;
        const long = cvSchema.parse({
          ...source,
          suggestedSkills: undefined,
          futureGoals: undefined,
          summary: 'طالب موهوب مهتم بالمشاريع التعليمية.',
          projects: Array.from({ length: 25 }, (_, i) => ({
            title: `المشروع التعليمي ${i + 1}`,
            description:
              'يصف هذا النص عملًا تجريبيًا طويلًا لاختبار التفاف العربية على صفحات الطباعة. '.repeat(
                12,
              ),
            studentRole: 'تنسيق العمل مع الفريق',
            date: null,
          })),
          missingInformation: ['ملاحظة سرية لا تُطبع'],
        });
        const edit = await client.mutate('PUT', `/api/students/${second.id}/cv/draft`, {
          revision: 0,
          content: long,
        });
        assert.equal(edit.statusCode, 200, edit.body);
        assert.equal(
          (
            await client.post(`/api/students/${second.id}/cv/approve`, {
              revision: edit.json<CvState>().revision,
            })
          ).statusCode,
          200,
        );
        const longPdf = await client.request({ url: `/api/students/${second.id}/cv/pdf` });
        assert.equal(longPdf.statusCode, 200);
        await writeFile(resolve(root, 'single-long.pdf'), longPdf.rawPayload);
        assert.ok((await PDFDocument.load(longPdf.rawPayload)).getPageCount() > 3);
        const batch = await client.post('/api/cv/export', { studentIds: [id, second.id] });
        assert.equal(batch.statusCode, 200, batch.body.slice(0, 100));
        await writeFile(resolve(root, 'batch.pdf'), batch.rawPayload);
        assert.ok((await PDFDocument.load(batch.rawPayload)).getPageCount() > 4);
        const filtered = await client.post('/api/cv/export', { filters: { search: prefix } });
        assert.equal(filtered.statusCode, 200);
        assert.equal(
          (
            await client.post('/api/cv/export', {
              studentIds: Array.from({ length: 21 }, () => randomUUID()),
            })
          ).statusCode,
          400,
        );
        assert.equal(fake.calls, count);
        const html = printTemplate(
          [
            {
              content: { ...long, summary: '<script>alert(1)</script>' },
              identity: {
                name: 'طالب',
                grade: 'SECOND',
                classroom: 'أ',
                primaryTalent: 'البرمجة',
                schoolName: 'ثانوية قباء',
                supervisors: [{ name: 'مشرف تجريبي', role: 'منسق الموهوبين' }],
              },
            },
          ],
          '',
          '',
        );
        assert.ok(html.includes('&lt;script&gt;'));
        assert.ok(!html.includes('ملاحظة سرية'));
        assert.ok(!html.includes('<script>'));
      },
    );
  },
);
