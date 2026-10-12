import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { createCvService } from '../src/modules/cv/service.js';
import { createWorkService } from '../src/modules/works/service.js';
import { FakeTextAi } from './fake-ai.js';
import { testCatalog } from './catalog.js';
import { testDefaults } from './env.js';
import { requireTestDatabaseUrl } from './isolation.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test(
  'CV services preserve transaction isolation under pool saturation and concurrent source changes',
  { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 },
  async (t) => {
    const db = createDatabase(requireTestDatabaseUrl(process.env.TEST_DATABASE_URL));
    const prefix = `refactor-${randomUUID()}`;
    const catalog = await testCatalog(db);
    const env = {
      ...testDefaults,
      NODE_ENV: 'test' as const,
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      COOKIE_SECRET: randomUUID() + randomUUID(),
      APP_ORIGIN: 'http://localhost:5186',
      HOST: '127.0.0.1',
      PORT: 3001,
      SESSION_HOURS: 8,
      STORAGE_DIR: resolve('.data', prefix),
    };
    const ai = new FakeTextAi();
    const app = await buildApp(env, { ai });
    await app.ready();
    const originalSchool = await db.schoolSettings.findUniqueOrThrow({ where: { id: 'school' } });
    t.after(async () => {
      await app.close();
      await db.student.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.schoolSettings.update({
        where: { id: 'school' },
        data: { name: originalSchool.name },
      });
      await db.$disconnect();
    });
    const students = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        db.student.create({
          data: {
            name: `${prefix}-${i}`,
            nameSearch: `${prefix}-${i}`,
            phoneNumber: '0501234567',
            grade: 'FIRST',
            academicYearId: catalog.year.id,
            classroomId: catalog.classroom.id,
            primaryTalentId: catalog.programming.id,
          },
        }),
      ),
    );
    const content = await ai.generate({
      primaryTalent: catalog.programming.name,
      additionalTalents: [],
      skills: [],
      achievements: [],
      projects: [],
      notes: '',
    });
    const cv = createCvService(db, app.storage, env, {
      ai,
      pdf: { render: async () => Buffer.from('%PDF') },
    });

    await t.test(
      'Five parallel saves do not require a second connection inside any transaction',
      async () => {
        const states = await Promise.all(
          students.map((student) => cv.saveDraft(student.id, { revision: 0, content })),
        );
        assert.ok(
          states.every((state) => state.revision === 1 && state.draft && !state.draftStale),
        );
      },
    );
    await t.test('Two writes to the same revision commit exactly one draft', async () => {
      const results = await Promise.allSettled([
        cv.saveDraft(students[0]!.id, { revision: 1, content }),
        cv.saveDraft(students[0]!.id, { revision: 1, content }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const failure = results.find((r) => r.status === 'rejected');
      assert.ok(failure?.status === 'rejected');
      assert.equal(failure.reason.code, 'CV_CONFLICT');
    });
    await t.test('A school change pending commit cannot be bypassed during approval', async () => {
      const locked = deferred(),
        release = deferred();
      const held = db.$transaction(
        async (tx) => {
          await tx.schoolSettings.update({ where: { id: 'school' }, data: { name: prefix } });
          locked.resolve();
          await release.promise;
        },
        { timeout: 10000 },
      );
      await locked.promise;
      let completed = false;
      const approval = cv.approve(students[1]!.id, 1, randomUUID()).then(
        () => {
          completed = true;
          return null;
        },
        (error: unknown) => {
          completed = true;
          return error;
        },
      );
      try {
        await new Promise((done) => setTimeout(done, 100));
        assert.equal(completed, false);
      } finally {
        release.resolve();
        await held;
      }
      const error = await approval;
      assert.ok(error && typeof error === 'object' && 'code' in error);
      assert.equal(error.code, 'CV_STALE');
      assert.equal((await cv.state(students[1]!.id)).approved, null);
    });
    await t.test('Editing work waits for the same parent lock used by CV writes', async () => {
      const works = createWorkService(db, app.storage);
      const work = await works.create(
        students[2]!.id,
        { title: 'Initial work', description: '', studentRole: '', url: '', date: null },
        [],
      );
      const locked = deferred(),
        release = deferred();
      const held = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${students[2]!.id}::uuid FOR UPDATE`;
          locked.resolve();
          await release.promise;
        },
        { timeout: 10000 },
      );
      await locked.promise;
      let completed = false;
      const update = works
        .update(students[2]!.id, work.id, {
          title: 'Changed work',
          description: '',
          studentRole: '',
          url: '',
          date: null,
        })
        .then((result) => {
          completed = true;
          return result;
        });
      try {
        await new Promise((done) => setTimeout(done, 100));
        assert.equal(completed, false);
        assert.equal(
          (await db.work.findUniqueOrThrow({ where: { id: work.id } })).title,
          'Initial work',
        );
      } finally {
        release.resolve();
        await held;
      }
      assert.equal((await update).title, 'Changed work');
    });
  },
);
