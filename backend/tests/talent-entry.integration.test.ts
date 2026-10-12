import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { hashPassword } from '../src/lib/password.js';
import { TestClient } from './client.js';
import { testDefaults } from './env.js';
import {
  namedRegistrationSchema,
  namedStudentSchema,
  studentSchema,
  registrationSchema,
  storedStudentSchema,
  type StudentView,
  type RegistrationView,
  type PageResult,
} from '@quba/shared';

test('Typed registration rejects duplicate and invalid talents', () => {
  const input = {
    name: 'طالب اختبار',
    phoneNumber: '0501234567',
    grade: 'FIRST',
    classroom: '١ / ٣',
    primaryTalent: 'برمجة',
    description: 'أحب تعلم البرمجة في المدرسة.',
  };
  assert.equal(namedRegistrationSchema.safeParse(input).success, true);
  for (const additionalTalents of [['البرمجه'], ['الرسم', 'رسم'], Array(11).fill('الرسم'), ['ـَ']])
    assert.equal(namedRegistrationSchema.safeParse({ ...input, additionalTalents }).success, false);
  assert.equal(namedRegistrationSchema.safeParse({ ...input, classroom: 'ـَ' }).success, false);
});

test('All student submissions require a valid phone number and normalize Arabic digits', () => {
  const identity = { name: 'طالب اختبار', grade: 'FIRST' };
  const named = { ...identity, classroom: 'أ', primaryTalent: 'الرسم' };
  const ids = {
    ...identity,
    classroomId: randomUUID(),
    primaryTalentId: randomUUID(),
  };
  for (const [schema, input] of [
    [namedStudentSchema, named],
    [studentSchema, ids],
    [namedRegistrationSchema, { ...named, description: 'أحب الرسم في المدرسة.' }],
    [registrationSchema, { ...ids, description: 'أحب الرسم في المدرسة.' }],
  ] as const) {
    assert.equal(schema.safeParse(input).success, false);
    for (const phoneNumber of ['', '   ', '123', '050abc4567', '+1234567890123456'])
      assert.equal(schema.safeParse({ ...input, phoneNumber }).success, false);
    assert.equal(schema.parse({ ...input, phoneNumber: '٠٥٠ ١٢٣-٤٥٦٧' }).phoneNumber, '0501234567');
    assert.equal(
      schema.parse({ ...input, phoneNumber: '+۹۶۶ (۵۰) ۱۲۳ ۴۵۶۷' }).phoneNumber,
      '+966501234567',
    );
  }
  assert.equal(storedStudentSchema.parse(ids).phoneNumber, '');
});

test(
  'Students enter new names; admin reviews, edits and adds without predefined options',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('Dedicated test database required');
    const db = createDatabase(url),
      prefix = randomUUID().slice(0, 8),
      password = randomBytes(20).toString('hex');
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
      STORAGE_DIR: '.data/talent-entry-tests',
      HOST: '127.0.0.1',
      PORT: 3001,
      SESSION_HOURS: 8,
    };
    const app = await buildApp(env),
      guest = new TestClient(app, env.APP_ORIGIN),
      client = new TestClient(app, env.APP_ORIGIN);
    t.after(async () => {
      await app.close();
      await db.registrationRequest.deleteMany({ where: { name: { contains: prefix } } });
      await db.student.deleteMany({ where: { name: { contains: prefix } } });
      await db.classroom.deleteMany({ where: { name: { contains: prefix } } });
      await db.talent.deleteMany({ where: { name: { contains: prefix } } });
      await db.admin.delete({ where: { id: admin.id } });
      await db.$disconnect();
    });
    const submitted = {
      name: `طالب ${prefix}`,
      phoneNumber: '٠٥٠ ١٢٣ ٤٥٦٧',
      grade: 'SECOND',
      classroom: `٢ / ٣ ${prefix}`,
      primaryTalent: `الخط العربي ${prefix}`,
      additionalTalents: [`الإلقاء ${prefix}`],
      description: 'أحب كتابة الخط العربي والمشاركة في الإلقاء.',
    };
    const missingPhone = { ...submitted, phoneNumber: undefined };
    assert.equal((await guest.post('/api/registrations', missingPhone)).statusCode, 400);
    const response = await guest.post('/api/registrations', submitted);
    assert.equal(response.statusCode, 201, response.body);
    assert.equal((await guest.request({ url: '/api/registrations' })).statusCode, 401);
    const options = (await guest.request({ url: '/api/registration-options' })).json<{
      classrooms: { name: string }[];
      talents: { name: string }[];
    }>();
    assert.ok(!options.talents.some((entry) => entry.name.includes(prefix)));
    assert.ok(!options.classrooms.some((entry) => entry.name.includes(prefix)));
    assert.equal(
      (await client.post('/api/auth/login', { email: admin.email, password })).statusCode,
      200,
    );
    const list = (await client.request({ url: '/api/registrations' })).json<
      PageResult<RegistrationView>
    >();
    const registration = list.items.find((entry) => entry.name === submitted.name)!;
    assert.equal(registration.primaryTalent, submitted.primaryTalent);
    assert.equal(registration.phoneNumber, '0501234567');
    assert.deepEqual(registration.additionalTalents, submitted.additionalTalents);
    const input = {
      ...submitted,
      description: undefined,
      skills: [],
      achievements: [],
      notes: submitted.description,
      supervisorOverrides: null,
    };
    const approval = await client.post(`/api/registrations/${registration.id}/approve`, input);
    assert.equal(approval.statusCode, 200, approval.body);
    const studentId = approval.json<{ studentId: string }>().studentId;
    const student = (
      await client.request({ url: `/api/students/${studentId}` })
    ).json<StudentView>();
    assert.equal(student.classroom, submitted.classroom);
    assert.equal(student.phoneNumber, '0501234567');
    assert.equal(student.primaryTalentId, registration.primaryTalentId);
    assert.deepEqual(student.additionalTalents, submitted.additionalTalents);
    const edit = await client.mutate('PUT', `/api/students/${studentId}`, {
      ...input,
      phoneNumber: '+966501234568',
      classroom: `٣ / ٢ ${prefix}`,
      primaryTalent: `التصوير ${prefix}`,
      additionalTalents: [],
    });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal(edit.json<StudentView>().primaryTalent, `التصوير ${prefix}`);
    assert.equal(edit.json<StudentView>().phoneNumber, '+966501234568');
    assert.deepEqual(edit.json<StudentView>().additionalTalents, []);
    const created = await client.post('/api/students', {
      ...input,
      name: `طالب جديد ${prefix}`,
      primaryTalent: `الرسم ${prefix}`,
    });
    assert.equal(created.statusCode, 201, created.body);
    // Existing ID-based clients continue to work during deployment.
    const oldClient = await client.post('/api/students', {
      name: `عميل قديم ${prefix}`,
      phoneNumber: '0501234567',
      grade: 'FIRST',
      classroomId: edit.json<StudentView>().classroomId,
      primaryTalentId: edit.json<StudentView>().primaryTalentId,
    });
    assert.equal(oldClient.statusCode, 201, oldClient.body);
  },
);
