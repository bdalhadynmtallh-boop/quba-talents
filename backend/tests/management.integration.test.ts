import { testCatalog } from './catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { readdir, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { hashPassword } from '../src/lib/password.js';
import type { Environment } from '../src/config/env.js';
import type {
  StudentView,
  WorkView,
  PageResult,
  RegistrationView,
  CvSource,
  SchoolView,
} from '@quba/shared';
import { TestClient, multipart } from './client.js';
import { testDefaults } from './env.js';
const url = process.env.TEST_DATABASE_URL;
test('Part 2 real database and file lifecycle', { skip: !url }, async (t) => {
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Use a dedicated *_test database.');
  const storageRoot = resolve('.data', `test-${randomUUID()}`);
  const env: Environment = {
    ...testDefaults,
    DATABASE_URL: url,
    COOKIE_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:5173',
    HOST: '127.0.0.1',
    PORT: 3001,
    SESSION_HOURS: 8,
    STORAGE_DIR: storageRoot,
  };
  const db = createDatabase(url),
    prefix = `test-${randomUUID()}`,
    password = randomBytes(24).toString('hex');
  const catalog = await testCatalog(db);
  const admin = await db.admin.create({
    data: {
      email: `${prefix}@example.test`,
      name: 'مسؤول اختبار',
      passwordHash: await hashPassword(password),
    },
  });
  let app = await buildApp(env);
  const client = new TestClient(app, env.APP_ORIGIN),
    guest = new TestClient(app, env.APP_ORIGIN);
  t.after(async () => {
    await app.close();
    await db.registrationRequest.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.student.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.admin.deleteMany({ where: { id: admin.id } });
    await db.supervisor.deleteMany({ where: { schoolId: 'school' } });
    await db.schoolSettings.update({
      where: { id: 'school' },
      data: { logoKey: null, logoName: null, logoMimeType: null },
    });
    await db.storageDeletion.deleteMany({});
    await db.$disconnect();
    const allowed = resolve('.data') + sep;
    if (!storageRoot.startsWith(allowed)) throw new Error('Unsafe cleanup target');
    await rm(storageRoot, { recursive: true, force: true });
  });
  const login = await client.post('/api/auth/login', { email: admin.email, password });
  assert.equal(login.statusCode, 200, login.body);
  const input = {
    name: `${prefix} أحمد`,
    phoneNumber: '0501234567',
    grade: 'SECOND',
    classroomId: catalog.classroom.id,
    primaryTalentId: catalog.programming.id,
    additionalTalentIds: [catalog.robotics.id],
    skills: ['حل المشكلات'],
    achievements: [{ title: 'معرض المدرسة', date: '2026-01-20' }],
    notes: 'معلومات حقيقية للاختبار',
    supervisorOverrides: null,
  };
  let approvedId = '',
    secondId = '',
    workId = '',
    attachmentId = '';
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#1670ef' } })
    .png()
    .toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  const webp = await sharp(png).webp().toBuffer();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage();
  const pdf = Buffer.from(await pdfDoc.save());
  async function upload(
    path: string,
    data: unknown,
    files: Array<{ name: string; type: string; buffer: Buffer }>,
  ) {
    const part = multipart(data, files);
    return client.request({
      method: 'POST',
      url: path,
      payload: part.payload,
      headers: { ...part.headers, ...(await client.csrf()) },
    });
  }
  await t.test(
    'Public registration reveals no student data; concurrent approval creates one student',
    async () => {
      const response = await guest.post('/api/registrations', {
        name: input.name,
        phoneNumber: input.phoneNumber,
        grade: input.grade,
        classroomId: input.classroomId,
        primaryTalentId: input.primaryTalentId,
        description: 'اهتمام بالبرمجة والمشاريع التعليمية',
      });
      assert.equal(response.statusCode, 201, response.body);
      assert.deepEqual(Object.keys(response.json()), ['message']);
      assert.equal((await guest.request({ url: '/api/students' })).statusCode, 401);
      assert.equal((await guest.request({ url: '/api/registrations' })).statusCode, 401);
      const list = await client.request({ url: '/api/registrations' });
      const registration = list
        .json<PageResult<RegistrationView>>()
        .items.find((item) => item.name === input.name);
      assert.ok(registration);
      const headers = await client.csrf();
      const results = await Promise.all([
        client.request({
          method: 'POST',
          url: `/api/registrations/${registration.id}/approve`,
          payload: input,
          headers,
        }),
        client.request({
          method: 'POST',
          url: `/api/registrations/${registration.id}/approve`,
          payload: input,
          headers,
        }),
      ]);
      assert.equal(results[0]!.statusCode, 200, results[0]!.body);
      assert.equal(results[1]!.statusCode, 200, results[1]!.body);
      approvedId = results[0]!.json<{ studentId: string }>().studentId;
      assert.equal(results[1]!.json<{ studentId: string }>().studentId, approvedId);
      assert.equal(await db.student.count({ where: { name: input.name } }), 1);
      assert.equal(
        (await db.student.findUniqueOrThrow({ where: { id: approvedId } })).isPublic,
        false,
      );
      const rejected = await guest.post('/api/registrations', {
        name: `${prefix} مرفوض`,
        phoneNumber: input.phoneNumber,
        grade: 'FIRST',
        classroomId: catalog.secondClassroom.id,
        primaryTalentId: catalog.drawing.id,
        description: 'اهتمام بالرسم والتصميم الفني',
      });
      assert.equal(rejected.statusCode, 201);
      const pending = (await client.request({ url: '/api/registrations' }))
        .json<PageResult<RegistrationView>>()
        .items.find((item) => item.name.endsWith('مرفوض'));
      assert.ok(pending);
      assert.equal((await client.post(`/api/registrations/${pending.id}/reject`)).statusCode, 200);
      assert.equal(
        (await client.post(`/api/registrations/${pending.id}/approve`, input)).statusCode,
        409,
      );
    },
  );
  await t.test(
    'Create and edit students; combined search, filters and server pagination',
    async () => {
      const created = await client.post('/api/students', {
        ...input,
        name: `${prefix} عمر`,
        grade: 'THIRD',
        primaryTalentId: catalog.drawing.id,
        achievements: [],
        notes: '',
      });
      assert.equal(created.statusCode, 201, created.body);
      secondId = created.json<StudentView>().id;
      const updated = await client.mutate('PUT', `/api/students/${secondId}`, {
        ...input,
        name: `${prefix} عمر معدل`,
        grade: 'THIRD',
        primaryTalentId: catalog.drawing.id,
      });
      assert.equal(updated.statusCode, 200, updated.body);
      const result = await client.request({
        url: `/api/students?search=${encodeURIComponent(prefix)}&grade=SECOND&talent=${encodeURIComponent(catalog.programming.id)}&pageSize=1`,
      });
      const data = result.json<PageResult<StudentView>>();
      assert.equal(result.statusCode, 200);
      assert.equal(data.total, 1);
      assert.equal(data.items[0]!.id, approvedId);
      const first = (
        await client.request({
          url: `/api/students?search=${encodeURIComponent(prefix)}&pageSize=1&page=1`,
        })
      ).json<PageResult<StudentView>>();
      const second = (
        await client.request({
          url: `/api/students?search=${encodeURIComponent(prefix)}&pageSize=1&page=2`,
        })
      ).json<PageResult<StudentView>>();
      assert.equal(first.total, 2);
      assert.equal(first.totalPages, 2);
      assert.notEqual(first.items[0]!.id, second.items[0]!.id);
      assert.equal((await client.request({ url: '/api/students?page=-1' })).statusCode, 400);
    },
  );
  await t.test('Real image/PDF uploads, role, link and protected ownership', async () => {
    const created = await upload(
      `/api/students/${approvedId}/works`,
      {
        title: 'مشروع تعليمي',
        description: 'تجربة رفع حقيقية',
        studentRole: 'تطوير الواجهة ضمن فريق',
        date: '2026-02-10',
        url: 'https://example.com',
      },
      [
        { name: 'image.png', type: 'image/png', buffer: png },
        { name: 'report.pdf', type: 'application/pdf', buffer: pdf },
        { name: 'photo.jpg', type: 'image/jpeg', buffer: jpeg },
        { name: 'image.webp', type: 'image/webp', buffer: webp },
      ],
    );
    assert.equal(created.statusCode, 201, created.body);
    const work = created.json<WorkView>();
    workId = work.id;
    attachmentId = work.attachments[0]!.id;
    assert.equal(work.attachments.length, 4);
    assert.equal(work.studentRole, 'تطوير الواجهة ضمن فريق');
    assert.equal('storageKey' in work.attachments[0]!, false);
    const path = `/api/students/${approvedId}/works/${workId}/attachments/${attachmentId}`;
    const allowed = await client.request({ url: path });
    assert.equal(allowed.statusCode, 200);
    assert.match(String(allowed.headers['content-type']), /image\/png/);
    assert.equal(allowed.headers['x-content-type-options'], 'nosniff');
    assert.equal((await guest.request({ url: path })).statusCode, 401);
    assert.equal(
      (await client.request({ url: path.replace(approvedId, secondId) })).statusCode,
      404,
    );
    const pdfAttachment = work.attachments.find((file) => file.mimeType === 'application/pdf')!;
    const downloaded = await client.request({
      url: `/api/students/${approvedId}/works/${workId}/attachments/${pdfAttachment.id}`,
    });
    assert.match(String(downloaded.headers['content-disposition']), /^attachment;/);
    assert.equal(
      (
        await client.mutate('PUT', `/api/students/${approvedId}/works/${workId}`, {
          title: 'عنوان معدل',
          description: 'وصف معدل',
          studentRole: 'تنفيذ جماعي',
          url: 'https://example.com/video',
          date: null,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await client.mutate('PUT', `/api/students/${secondId}/works/${workId}`, {
          title: 'عنوان خاطئ',
        })
      ).statusCode,
      404,
    );
  });
  await t.test('Every management endpoint rejects an unauthenticated sender', async () => {
    const student = `/api/students/${approvedId}`;
    const work = `${student}/works/${workId}`;
    const attachment = `${work}/attachments/${attachmentId}`;
    const registration = `/api/registrations/${randomUUID()}`;
    const endpoints = [
      ['GET', '/api/students'],
      ['POST', '/api/students'],
      ['GET', student],
      ['PUT', student],
      ['DELETE', student],
      ['GET', `${student}/cv/source`],
      ['POST', `${student}/works`],
      ['PUT', work],
      ['DELETE', work],
      ['POST', `${work}/attachments`],
      ['GET', attachment],
      ['DELETE', attachment],
      ['GET', '/api/registrations'],
      ['POST', `${registration}/approve`],
      ['POST', `${registration}/reject`],
      ['GET', '/api/school'],
      ['PUT', '/api/school'],
      ['GET', '/api/school/logo'],
      ['POST', '/api/school/logo'],
      ['DELETE', '/api/school/logo'],
    ] as const;
    for (const [method, path] of endpoints) {
      const response =
        method === 'GET'
          ? await guest.request({ url: path })
          : await guest.request({ method, url: path, headers: await guest.csrf() });
      assert.equal(response.statusCode, 401, `${method} ${path}: ${response.body}`);
    }
  });
  await t.test('Logo creation rolls back the file if school initialization fails', async () => {
    const before = await readdir(storageRoot);
    const original = app.db.schoolSettings.upsert;
    app.db.schoolSettings.upsert = () => {
      throw new Error('Injected database failure');
    };
    try {
      const response = await upload('/api/school/logo', undefined, [
        { name: 'logo.png', type: 'image/png', buffer: png },
      ]);
      assert.equal(response.statusCode, 500);
      assert.deepEqual((await readdir(storageRoot)).sort(), before.sort());
    } finally {
      app.db.schoolSettings.upsert = original;
    }
  });
  await t.test(
    'Invalid bytes, HTML/SVG/executables, limits and failed upload rollback',
    async () => {
      const filesBefore = (await readdir(storageRoot)).length;
      const worksBefore = await db.work.count({ where: { studentId: approvedId } });
      for (const [name, buffer] of [
        ['fake.png', Buffer.from('<html>fake</html>')],
        ['file.exe', Buffer.from('MZ executable')],
        ['file.svg', Buffer.from('<svg></svg>')],
        ['file.html', Buffer.from('<html></html>')],
        ['fake.pdf', Buffer.from('%PDF-1.7\ninvalid')],
      ] as const) {
        const result = await upload(`/api/students/${approvedId}/works`, { title: 'رفع ممنوع' }, [
          { name, type: 'image/png', buffer },
        ]);
        assert.equal(result.statusCode, 400, result.body);
      }
      const partial = await upload(`/api/students/${approvedId}/works`, { title: 'فشل جزئي' }, [
        { name: 'valid.png', type: 'image/png', buffer: png },
        { name: 'bad.png', type: 'image/png', buffer: Buffer.from('invalid') },
      ]);
      assert.equal(partial.statusCode, 400);
      assert.equal((await readdir(storageRoot)).length, filesBefore);
      assert.equal(await db.work.count({ where: { studentId: approvedId } }), worksBefore);
      const oversized = await upload(`/api/students/${approvedId}/works`, { title: 'حجم كبير' }, [
        { name: 'large.png', type: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
      ]);
      assert.equal(oversized.statusCode, 413, oversized.body);
      const tooMany = await upload(
        `/api/students/${approvedId}/works`,
        { title: 'عدد كبير' },
        Array.from({ length: 7 }, (_, i) => ({ name: `${i}.png`, type: 'image/png', buffer: png })),
      );
      assert.equal(tooMany.statusCode, 413, tooMany.body);
      const fills = await upload(
        `/api/students/${approvedId}/works/${workId}/attachments`,
        undefined,
        [
          { name: '5.png', type: 'image/png', buffer: png },
          { name: '6.png', type: 'image/png', buffer: png },
        ],
      );
      assert.equal(fills.statusCode, 201, fills.body);
      const seventh = await upload(
        `/api/students/${approvedId}/works/${workId}/attachments`,
        undefined,
        [{ name: '7.png', type: 'image/png', buffer: png }],
      );
      assert.equal(seventh.statusCode, 400);
      assert.equal(await db.attachment.count({ where: { workId } }), 6);
      const unsafe = await client.post(`/api/students/${approvedId}/works`, {
        title: 'رابط غير آمن',
        url: 'javascript:alert(1)',
      });
      assert.equal(unsafe.statusCode, 400);
    },
  );
  await t.test(
    'School logo/supervisor order and per-student overrides prepare real CV source',
    async () => {
      assert.equal((await guest.request({ url: '/api/school' })).statusCode, 401);
      const school = await client.mutate('PUT', '/api/school', {
        name: 'مدرسة اختبار قباء',
        supervisors: [
          { name: 'مشرف تجريبي ب', role: 'مشرف المشاريع' },
          { name: 'مشرف تجريبي أ', role: 'منسق المواهب' },
        ],
      });
      assert.equal(school.statusCode, 200, school.body);
      const logo = multipart(undefined, [{ name: 'logo.png', type: 'image/png', buffer: png }]);
      const logoResult = await client.request({
        method: 'POST',
        url: '/api/school/logo',
        payload: logo.payload,
        headers: { ...logo.headers, ...(await client.csrf()) },
      });
      assert.equal(logoResult.statusCode, 200, logoResult.body);
      assert.equal((await guest.request({ url: '/api/school/logo' })).statusCode, 401);
      assert.equal((await client.request({ url: '/api/school/logo' })).statusCode, 200);
      const source = (
        await client.request({ url: `/api/students/${approvedId}/cv/source` })
      ).json<CvSource>();
      assert.equal(source.student.works.length, 1);
      assert.equal(source.student.cv, null);
      assert.equal(source.supervisors[0]!.name, 'مشرف تجريبي ب');
      const override = {
        ...input,
        supervisorOverrides: [{ name: 'مشرف خاص تجريبي', role: 'مشرف الطالب' }],
      };
      assert.equal(
        (await client.mutate('PUT', `/api/students/${approvedId}`, override)).statusCode,
        200,
      );
      assert.equal(
        (await client.request({ url: `/api/students/${approvedId}/cv/source` })).json<CvSource>()
          .supervisors[0]!.name,
        'مشرف خاص تجريبي',
      );
      assert.equal(
        (await guest.request({ url: `/api/students/${approvedId}/cv/source` })).statusCode,
        401,
      );
    },
  );
  await t.test(
    'Application restart preserves students, sessions, supervisors and files',
    async () => {
      await app.close();
      app = await buildApp(env);
      client.app = app;
      guest.app = app;
      const profile = await client.request({ url: `/api/students/${approvedId}` });
      assert.equal(profile.statusCode, 200, profile.body);
      assert.equal(profile.json<StudentView>().works[0]!.attachments.length, 6);
      assert.equal(
        (await client.request({ url: '/api/school' })).json<SchoolView>().supervisors[0]!.name,
        'مشرف تجريبي ب',
      );
      assert.equal(
        (
          await client.request({
            url: `/api/students/${approvedId}/works/${workId}/attachments/${attachmentId}`,
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    'Durable deletion retries disk failure; work/student deletion leaves no files',
    async () => {
      const originalRemove = app.storage.remove.bind(app.storage);
      app.storage.remove = async () => {
        throw new Error('Simulated disk busy');
      };
      const deleted = await client.mutate(
        'DELETE',
        `/api/students/${approvedId}/works/${workId}/attachments/${attachmentId}`,
      );
      assert.equal(deleted.statusCode, 204, deleted.body);
      assert.equal(await db.storageDeletion.count(), 1);
      assert.equal(
        (
          await client.request({
            url: `/api/students/${approvedId}/works/${workId}/attachments/${attachmentId}`,
          })
        ).statusCode,
        404,
      );
      app.storage.remove = originalRemove;
      await app.storage.maintain(app.db);
      assert.equal(await db.storageDeletion.count(), 0);
      assert.equal(
        (await client.mutate('DELETE', `/api/students/${approvedId}/works/${workId}`)).statusCode,
        204,
      );
      assert.equal(await db.attachment.count({ where: { workId } }), 0);
      assert.equal((await client.mutate('DELETE', '/api/school/logo')).statusCode, 204);
      assert.equal((await client.mutate('DELETE', `/api/students/${secondId}`)).statusCode, 204);
      const fresh = await upload(`/api/students/${approvedId}/works`, { title: 'حذف متسلسل' }, [
        { name: 'cascade.png', type: 'image/png', buffer: png },
      ]);
      assert.equal(fresh.statusCode, 201);
      assert.equal((await client.mutate('DELETE', `/api/students/${approvedId}`)).statusCode, 204);
      assert.equal((await readdir(storageRoot)).length, 0);
      assert.equal(await db.storageDeletion.count(), 0);
    },
  );
});
test('Public registration flood limit', { skip: !url }, async (t) => {
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use a dedicated test DB');
  const prefix = `test-${randomUUID()}`;
  const env: Environment = {
    ...testDefaults,
    DATABASE_URL: url,
    COOKIE_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:5173',
    HOST: '127.0.0.1',
    PORT: 3001,
    SESSION_HOURS: 8,
    STORAGE_DIR: resolve('.data', prefix),
  };
  const app = await buildApp(env),
    client = new TestClient(app, env.APP_ORIGIN);
  t.after(async () => {
    await app.db.registrationRequest.deleteMany({ where: { name: prefix } });
    await app.close();
    const allowed = resolve('.data') + sep;
    if (!env.STORAGE_DIR.startsWith(allowed)) throw new Error('Unsafe cleanup');
    await rm(env.STORAGE_DIR, { recursive: true, force: true });
  });
  const catalog = await testCatalog(app.db);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await client.post('/api/registrations', {
          name: prefix,
          phoneNumber: '0501234567',
          grade: 'FIRST',
          classroomId: catalog.classroom.id,
          primaryTalentId: catalog.programming.id,
          description: 'اهتمام بالبرمجة والمشاريع',
        })
      ).statusCode,
      201,
    );
  assert.equal(
    (
      await client.post('/api/registrations', {
        name: prefix,
        phoneNumber: '0501234567',
        grade: 'FIRST',
        classroomId: catalog.classroom.id,
        primaryTalentId: catalog.programming.id,
        description: 'اهتمام بالبرمجة والمشاريع',
      })
    ).statusCode,
    429,
  );
});
