import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { rm } from 'node:fs/promises';
import {
  normalizeArabic,
  catalogNameKey,
  type StudentView,
  type YearSettings,
  type CvState,
  type PageResult,
  type DashboardView,
} from '@quba/shared';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { hashPassword } from '../src/lib/password.js';
import { TestClient } from './client.js';
import { testDefaults } from './env.js';
import { FakeTextAi } from './fake-ai.js';
import { testCatalog } from './catalog.js';
const url = process.env.TEST_DATABASE_URL;
test('Arabic normalizer keeps distinct hamza letters and catalog keys merge spelling variants', () => {
  for (const name of ['أحمد', 'احمد', 'أحْمد', 'آحمد', 'إحمد', 'ٱحمد'])
    assert.equal(normalizeArabic(name), 'احمد');
  assert.equal(normalizeArabic('  فاطـمة\u0670  '), 'فاطمه');
  assert.equal(normalizeArabic('على'), 'علي');
  assert.notEqual(normalizeArabic('علي'), normalizeArabic('علاء'));
  assert.notEqual(normalizeArabic('رؤى'), normalizeArabic('روي'));
  assert.notEqual(normalizeArabic('بئر'), normalizeArabic('بير'));
  assert.equal(catalogNameKey('برمجة'), catalogNameKey('البرمجه'));
});
test(
  'Academic lifecycle, catalogs, normalized search and private dashboard',
  { skip: !url },
  async (t) => {
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('Dedicated *_test database required');
    const db = createDatabase(url),
      prefix = randomUUID().slice(0, 8),
      password = randomBytes(20).toString('hex');
    const storageRoot = resolve('.data', `academic-${prefix}`);
    const catalog = await testCatalog(db);
    const admin = await db.admin.create({
      data: {
        email: `academic-${prefix}@example.test`,
        name: 'مسؤول اختبار',
        passwordHash: await hashPassword(password),
      },
    });
    const rendered: string[][] = [];
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
    const app = await buildApp(env, {
      ai: new FakeTextAi(),
      pdf: {
        async render(items) {
          rendered.push(items.map((i) => i.identity.name));
          return Buffer.from('%PDF-1.7\n%%EOF');
        },
      },
    });
    const client = new TestClient(app, env.APP_ORIGIN),
      guest = new TestClient(app, env.APP_ORIGIN);
    const ownedCatalogIds: string[] = [];
    t.after(async () => {
      await app.close();
      await db.registrationRequest.deleteMany({ where: { name: { contains: prefix } } });
      await db.student.deleteMany({ where: { name: { contains: prefix } } });
      await db.talent.deleteMany({ where: { id: { in: ownedCatalogIds } } });
      await db.admin.delete({ where: { id: admin.id } });
      await db.$disconnect();
      if (!storageRoot.startsWith(resolve('.data') + sep)) throw new Error('Unsafe cleanup');
      await rm(storageRoot, { recursive: true, force: true });
    });
    assert.equal(
      (await client.post('/api/auth/login', { email: admin.email, password })).statusCode,
      200,
    );
    const base = {
      classroomId: catalog.classroom.id,
      primaryTalentId: catalog.programming.id,
      additionalTalentIds: [],
      skills: [],
      achievements: [],
      notes: '',
      supervisorOverrides: null,
    };
    const students: StudentView[] = [];
    for (const [grade, name] of [
      ['FIRST', 'أحْمد'],
      ['SECOND', 'فاطمة'],
      ['THIRD', 'علي'],
    ] as const) {
      const r = await client.post('/api/students', { ...base, grade, name: `${name} ${prefix}` });
      assert.equal(r.statusCode, 201, r.body);
      students.push(r.json<StudentView>());
    }
    const [first, second, third] = students as [StudentView, StudentView, StudentView];
    let initial: YearSettings;
    await t.test('One open year, protected writes, rename and preview counts', async () => {
      assert.equal((await guest.request({ url: '/api/dashboard' })).statusCode, 401);
      assert.equal((await guest.request({ url: '/api/school' })).statusCode, 401);
      assert.equal((await guest.request({ url: '/api/academic-years' })).statusCode, 401);
      assert.equal((await guest.post('/api/academic-years/rollover', {})).statusCode, 401);
      assert.equal(
        (
          await client.request({
            method: 'PUT',
            url: '/api/academic-years/current',
            payload: { label: 'اختبار' },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (await client.mutate('PUT', '/api/academic-years/current', { label: `السنة ${prefix}` }))
          .statusCode,
        200,
      );
      initial = (await client.request({ url: '/api/academic-years' })).json<YearSettings>();
      assert.deepEqual(initial.counts, { FIRST: 1, SECOND: 1, THIRD: 1 });
      assert.equal(initial.current.label, `السنة ${prefix}`);
      await assert.rejects(db.academicYear.create({ data: { label: 'سنة مفتوحة أخرى' } }));
    });
    await t.test(
      'Arabic contains search matches spellings without unrelated names and updates index on edit',
      async () => {
        const list = (
          await client.request({ url: '/api/students?search=' + encodeURIComponent('احمد') })
        ).json<PageResult<StudentView>>();
        assert.deepEqual(
          list.items.map((s) => s.id),
          [first.id],
        );
        assert.equal(
          (
            await client.request({ url: '/api/students?search=' + encodeURIComponent('فاطمه') })
          ).json<PageResult<StudentView>>().items[0]!.id,
          second.id,
        );
        assert.equal(
          (
            await client.request({ url: '/api/students?search=' + encodeURIComponent('علاء') })
          ).json<PageResult<StudentView>>().total,
          0,
        );
        assert.equal(
          (await db.student.findUniqueOrThrow({ where: { id: first.id } })).nameSearch,
          normalizeArabic(first.name),
        );
      },
    );
    let customId = '';
    await t.test(
      'Catalog uniqueness, public projection, rename retains counts, inactive references retained only on existing files',
      async () => {
        const created = await client.post('/api/school/talents', { name: `برمجة ${prefix}` });
        assert.equal(created.statusCode, 201, created.body);
        customId = created.json<{ id: string }>().id;
        ownedCatalogIds.push(customId);
        assert.equal(
          (await client.post('/api/school/talents', { name: `البرمجه ${prefix}` })).statusCode,
          409,
        );
        const input = { ...base, grade: 'FIRST', name: first.name, primaryTalentId: customId };
        assert.equal(
          (await client.mutate('PUT', `/api/students/${first.id}`, input)).statusCode,
          200,
        );
        const count = await db.student.count({ where: { primaryTalentId: customId } });
        assert.equal(
          (
            await client.mutate('PUT', `/api/school/talents/${customId}`, {
              name: `تقنية ${prefix}`,
              active: false,
              sortOrder: 2,
            })
          ).statusCode,
          200,
        );
        assert.equal(await db.student.count({ where: { primaryTalentId: customId } }), count);
        assert.equal(
          (await client.request({ url: `/api/students/${first.id}` })).json<StudentView>()
            .primaryTalent,
          `تقنية ${prefix}`,
        );
        assert.equal(
          (
            await client.mutate('PUT', `/api/students/${first.id}`, {
              ...input,
              notes: 'تصحيح بيانات',
            })
          ).statusCode,
          200,
        );
        const payload = {
          name: `طلب ${prefix}`,
          grade: 'FIRST',
          classroomId: catalog.classroom.id,
          primaryTalentId: customId,
          description: 'طلب موهبة للاختبار',
        };
        assert.equal((await guest.post('/api/registrations', payload)).statusCode, 400);
        assert.equal(
          (
            await client.mutate('PUT', `/api/school/classrooms/${catalog.classroom.id}`, {
              name: 'أ',
              active: false,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await guest.post('/api/registrations', {
              ...payload,
              primaryTalentId: catalog.programming.id,
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (await client.mutate('PUT', `/api/students/${first.id}`, input)).statusCode,
          200,
        );
        assert.equal(
          (await client.post('/api/students', { ...input, name: `جديد ${prefix}` })).statusCode,
          400,
        );
        const options = (await guest.request({ url: '/api/registration-options' })).json<{
          classrooms: { id: string; name: string }[];
          talents: { id: string; name: string }[];
        }>();
        assert.deepEqual(Object.keys(options).sort(), ['classrooms', 'talents']);
        assert.ok(!options.classrooms.some((c) => c.id === catalog.classroom.id));
        assert.ok(!options.talents.some((c) => c.id === customId));
        assert.ok(options.talents.every((c) => Object.keys(c).sort().join(',') === 'id,name'));
        assert.equal(
          (
            await client.mutate('PUT', `/api/school/classrooms/${catalog.classroom.id}`, {
              name: 'أ',
              active: true,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await client.post('/api/students', {
              ...input,
              name: `تكرار ${prefix}`,
              additionalTalentIds: [customId],
            })
          ).statusCode,
          400,
        );
      },
    );
    let workId = '';
    await t.test(
      'Documented works, attachments and approved snapshots prepared before rollover',
      async () => {
        const work = await db.work.create({
          data: {
            studentId: third.id,
            title: 'عمل موثق',
            attachments: {
              create: {
                storageKey: `academic-${prefix}`,
                originalName: 'وثيقة.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 1,
              },
            },
          },
        });
        workId = work.id;
        for (const student of [first, third]) {
          const r = await client.post(`/api/students/${student.id}/cv/generate`, { revision: 0 });
          assert.equal(r.statusCode, 200, r.body);
          const state = (
            await client.request({ url: `/api/students/${student.id}/cv` })
          ).json<CvState>();
          assert.equal(state.draftSnapshot!.academicYearLabel, initial.current.label);
          assert.equal(
            (
              await client.post(`/api/students/${student.id}/cv/approve`, {
                revision: state.revision,
              })
            ).statusCode,
            200,
          );
        }
      },
    );
    let nextId = '';
    await t.test(
      'Rollover transaction promotes once, archives third and preserves approved CV freshness and all files',
      async () => {
        const payload = {
          yearId: initial.current.id,
          label: `الجديدة ${prefix}`,
          requestId: randomUUID(),
        };
        const responses = await Promise.all([
          client.post('/api/academic-years/rollover', payload),
          client.post('/api/academic-years/rollover', payload),
        ]);
        for (const response of responses) assert.equal(response.statusCode, 200, response.body);
        assert.deepEqual(responses[0]!.json(), responses[1]!.json());
        nextId = responses[0]!.json<{ newYearId: string }>().newYearId;
        assert.equal(
          (
            await client.post('/api/academic-years/rollover', {
              ...payload,
              requestId: randomUUID(),
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (await client.post('/api/academic-years/rollover', { ...payload, label: 'اسم مختلف' }))
            .statusCode,
          409,
        );
        assert.equal(
          (await db.student.findUniqueOrThrow({ where: { id: first.id } })).grade,
          'SECOND',
        );
        assert.equal(
          (await db.student.findUniqueOrThrow({ where: { id: second.id } })).grade,
          'THIRD',
        );
        const archived = await db.student.findUniqueOrThrow({
          where: { id: third.id },
          include: { cv: true, works: { include: { attachments: true } } },
        });
        assert.equal(archived.status, 'ARCHIVED');
        assert.equal(archived.grade, 'THIRD');
        assert.equal(archived.academicYearId, initial.current.id);
        assert.ok(archived.archivedAt);
        assert.ok(archived.cv?.approved);
        assert.equal(archived.works[0]!.id, workId);
        assert.equal(archived.works[0]!.attachments.length, 1);
        for (const student of [first, third])
          assert.equal(
            (await client.request({ url: `/api/students/${student.id}/cv` })).json<CvState>()
              .approvedStale,
            false,
          );
        assert.equal(
          (await client.request({ url: `/api/students/${third.id}/cv/pdf` })).statusCode,
          200,
        );
        assert.equal(await db.academicYear.count({ where: { status: 'OPEN' } }), 1);
      },
    );
    await t.test(
      'Lists, dashboard and PDF batches respect current or intentionally selected archive scope',
      async () => {
        const current = (await client.request({ url: '/api/students' })).json<
          PageResult<StudentView>
        >();
        assert.deepEqual(new Set(current.items.map((s) => s.id)), new Set([first.id, second.id]));
        const old = (
          await client.request({ url: `/api/students?academicYearId=${initial.current.id}` })
        ).json<PageResult<StudentView>>();
        assert.deepEqual(
          old.items.map((s) => s.id),
          [third.id],
        );
        const dashboard = (await client.request({ url: '/api/dashboard' })).json<DashboardView>();
        assert.deepEqual(dashboard.grades, { FIRST: 0, SECOND: 1, THIRD: 1 });
        assert.equal(dashboard.approvedCvs, 1);
        assert.equal(dashboard.academicYear.id, nextId);
        assert.equal(dashboard.talents.find((t) => t.id === customId)!.count, 1);
        assert.equal((await client.post('/api/cv/export', { filters: {} })).statusCode, 200);
        assert.deepEqual(rendered.at(-1), [first.name]);
        assert.equal(
          (await client.post('/api/cv/export', { studentIds: [third.id] })).statusCode,
          409,
        );
        assert.equal(
          (await client.post('/api/cv/export', { filters: { academicYearId: initial.current.id } }))
            .statusCode,
          200,
        );
        assert.deepEqual(rendered.at(-1), [third.name]);
        assert.equal(
          (
            await client.post('/api/cv/export', {
              studentIds: [third.id],
              scope: { academicYearId: initial.current.id },
            })
          ).statusCode,
          200,
        );
      },
    );
    await t.test(
      'Explicit restoration returns third to current year; old pending registration is accepted into it',
      async () => {
        assert.equal((await guest.post(`/api/students/${third.id}/restore`)).statusCode, 401);
        assert.equal((await client.post(`/api/students/${third.id}/restore`)).statusCode, 200);
        const restored = await db.student.findUniqueOrThrow({ where: { id: third.id } });
        assert.equal(restored.status, 'ACTIVE');
        assert.equal(restored.grade, 'THIRD');
        assert.equal(restored.academicYearId, nextId);
        assert.equal(restored.archivedAt, null);
        assert.equal((await client.post(`/api/students/${third.id}/restore`)).statusCode, 409);
        assert.equal(
          (await client.request({ url: `/api/students/${third.id}/cv` })).json<CvState>()
            .approvedStale,
          false,
        );
        const request = await db.registrationRequest.create({
          data: {
            name: `طلب قديم ${prefix}`,
            nameSearch: normalizeArabic(`طلب قديم ${prefix}`),
            grade: 'FIRST',
            classroomId: catalog.classroom.id,
            primaryTalentId: catalog.programming.id,
            description: 'طلب قديم معلق',
            createdAt: new Date('2025-01-01'),
          },
        });
        const result = await client.post(`/api/registrations/${request.id}/approve`, {
          ...base,
          grade: 'FIRST',
          name: request.name,
        });
        assert.equal(result.statusCode, 200, result.body);
        assert.equal(
          (
            await db.student.findUniqueOrThrow({
              where: { id: result.json<{ studentId: string }>().studentId },
            })
          ).academicYearId,
          nextId,
        );
      },
    );
  },
);
