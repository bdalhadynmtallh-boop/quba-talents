import { requireTestDatabaseUrl } from '../../backend/tests/isolation.js';
import { testCatalog } from '../../backend/tests/catalog.js';
import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../backend/src/app.js';
import { createDatabase } from '../../backend/src/plugins/database.js';
import { hashPassword } from '../../backend/src/lib/password.js';
import { FakeTextAi } from '../../backend/tests/fake-ai.js';
import { testDefaults } from '../../backend/tests/env.js';
import { cvSchema } from '@quba/shared';
test.use({ baseURL: 'http://localhost:5187' });
test.setTimeout(90000);
const prefix = `رحلة السيرة ${randomUUID().slice(0, 8)}`,
  email = `cv-browser-${randomUUID()}@example.test`,
  password = randomBytes(20).toString('hex');
const storageRoot = resolve('backend/.data', `cv-browser-${randomUUID()}`);
let db: ReturnType<typeof createDatabase>, app: FastifyInstance, web: ChildProcess, adminId: string;
const fake = new FakeTextAi();
let apiEnvironment: Parameters<typeof buildApp>[0];
test.beforeAll(async () => {
  if (process.env.BROWSER_TESTS_ALLOW_DB_WRITE !== 'yes')
    throw new Error('Browser database writes must be explicitly enabled.');
  const url = new URL(requireTestDatabaseUrl(process.env.TEST_DATABASE_URL));
  db = createDatabase(url.href);
  await testCatalog(db);
  adminId = (
    await db.admin.create({
      data: {
        email,
        name: 'مسؤول اختبار السيرة',
        passwordHash: await hashPassword(password),
      },
    })
  ).id;
  apiEnvironment = {
    ...testDefaults,
    NODE_ENV: 'test',
    DATABASE_URL: url.href,
    COOKIE_SECRET: randomBytes(32).toString('hex'),
    APP_ORIGIN: 'http://localhost:5187',
    HOST: '127.0.0.1',
    PORT: 3002,
    SESSION_HOURS: 8,
    STORAGE_DIR: storageRoot,
  };
  app = await buildApp(apiEnvironment, { ai: fake });
  await app.listen({ host: '127.0.0.1', port: 3002 });
  web = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], {
    cwd: resolve('frontend'),
    env: { ...process.env, WEB_PORT: '5187', API_PROXY_TARGET: 'http://127.0.0.1:3002' },
    stdio: 'ignore',
    windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://localhost:5187/health/ready')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  if (!ready) throw new Error('Isolated test preview failed to start.');
});
test.afterAll(async () => {
  web?.kill();
  await app?.close();
  if (db) {
    await db.registrationRequest.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.student.deleteMany({ where: { name: { startsWith: prefix } } });
    if (adminId) await db.admin.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
  }
  if (!storageRoot.startsWith(resolve('backend/.data') + sep)) throw new Error('Unsafe cleanup');
  await rm(storageRoot, { recursive: true, force: true });
});

test('Required phone persists through registration, approval, editing and approved CV', async ({
  page,
}) => {
  const name = `${prefix} جوال`;
  await page.goto('/register');
  await page.getByLabel('اسم الطالب', { exact: true }).fill(name);
  await page.getByLabel('رقم الجوال', { exact: true }).fill('٠٥٠ ١٢٣ ٤٥٦٧');
  await page.getByLabel('الصف', { exact: true }).selectOption('SECOND');
  await page.getByLabel('الفصل', { exact: true }).fill('أ');
  await page.getByLabel('الموهبة الرئيسية', { exact: true }).fill('البرمجة');
  await page.getByLabel('وصف مختصر للموهبة').fill('أحب البرمجة وتطوير المواقع التعليمية.');
  await page.getByRole('button', { name: 'إرسال طلب التسجيل' }).click();
  await expect(page.getByRole('heading', { name: 'وصلت موهبتك إلينا!' })).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('button', { name: 'طلبات التسجيل', exact: true }).click();
  await page
    .locator('.registration-card')
    .filter({ hasText: name })
    .getByRole('button', { name: 'مراجعة وقبول' })
    .click();
  await expect(page.getByLabel('رقم الجوال', { exact: true })).toHaveValue('0501234567');
  await page.getByRole('button', { name: 'قبول الطلب وإضافة الطالب' }).click();
  await page
    .getByRole('dialog', { name: 'طلبات التسجيل' })
    .getByRole('button', { name: 'إغلاق النافذة' })
    .click();
  await page
    .locator('.student-card')
    .filter({ hasText: name })
    .getByRole('link', { name: 'عرض ملف الطالب' })
    .click();
  await expect(page.locator('.student-summary')).toContainText('0501234567');
  await page.getByRole('button', { name: 'تعديل الطالب', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'تعديل الطالب' });
  await edit.getByLabel('رقم الجوال', { exact: true }).fill('');
  await edit.getByRole('button', { name: 'حفظ الطالب' }).click();
  await expect(edit).toBeVisible();
  await edit.getByLabel('رقم الجوال', { exact: true }).fill('+966 50 123 4568');
  await edit.getByRole('button', { name: 'حفظ الطالب' }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.locator('.student-summary')).toContainText('+966501234568');
  await page.getByRole('button', { name: 'إنشاء السيرة بالذكاء الاصطناعي', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'مراجعة البيانات قبل الصياغة' })
    .getByRole('checkbox')
    .check();
  await page.getByRole('button', { name: 'بدء الصياغة', exact: true }).click();
  await expect(page.locator('.cv-paper')).toContainText('+966501234568');
  await expect(page.locator('.cv-official-header')).toContainText('مجمع ثانوية قباء');
  await page.getByRole('button', { name: 'اعتماد وحفظ' }).click();
  await page.getByRole('dialog', { name: 'اعتماد السيرة' }).getByRole('checkbox').check();
  await page
    .getByRole('dialog', { name: 'اعتماد السيرة' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'تنزيل PDF المعتمد' })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const saved = await db.student.findUniqueOrThrow({ where: { id }, include: { cv: true } });
  expect(saved.phoneNumber).toBe('+966501234568');
  expect(saved.cv?.approvedSnapshot).toMatchObject({ phoneNumber: '+966501234568' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('phone-profile-390.png'), fullPage: true });
});
test.beforeEach(async () => {
  // Each isolated journey gets a fresh rate-limit window; production limits stay unchanged.
  await app.close();
  // School-wide settings are owned by this dedicated test database as well.
  await db.supervisor.deleteMany({ where: { schoolId: 'school' } });
  // Each journey owns its records; a previous journey must not affect selectors,
  // dashboard counts or filtered PDF exports in the next one.
  const previous = await db.student.findMany({
    where: { name: { startsWith: prefix } },
    include: { works: { include: { attachments: true } } },
  });
  await db.$transaction(async (tx) => {
    const keys = previous.flatMap((student) =>
      student.works.flatMap((work) => work.attachments.map((file) => file.storageKey)),
    );
    if (keys.length)
      await tx.storageDeletion.createMany({
        data: keys.map((storageKey) => ({ storageKey })),
        skipDuplicates: true,
      });
    await tx.registrationRequest.deleteMany({ where: { name: { startsWith: prefix } } });
    await tx.student.deleteMany({ where: { name: { startsWith: prefix } } });
  });
  await app.storage.maintain(db);
  app = await buildApp(apiEnvironment, { ai: fake });
  await app.listen({ host: '127.0.0.1', port: 3002 });
});
test('Full CV journey with test-only AI and real API/PostgreSQL/uploads/Chromium', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/api/school/logo'))
      errors.push(`School logo HTTP ${response.status()}`);
  });
  await page.goto('/register');
  await page.getByLabel('اسم الطالب', { exact: true }).fill(`${prefix} أحمد`);
  await page.getByLabel('رقم الجوال', { exact: true }).fill('0501234567');
  await page.getByLabel('الصف', { exact: true }).selectOption('SECOND');
  await page.getByLabel('الفصل', { exact: true }).fill(`${prefix} أ`);
  await page.getByLabel('الموهبة الرئيسية', { exact: true }).fill('البرمجة');
  await page.getByLabel('مواهب إضافية (اختياري، كل موهبة في سطر، حتى 10)').fill(`العزف ${prefix}`);
  await page.getByLabel('وصف مختصر للموهبة').fill('أحب تطوير المشاريع التعليمية مع فريق المدرسة.');
  await page.getByRole('button', { name: 'إرسال طلب التسجيل' }).click();
  await expect(page.getByRole('heading', { name: 'وصلت موهبتك إلينا!' })).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('button', { name: 'طلبات التسجيل', exact: true }).click();
  await page
    .locator('.registration-card')
    .filter({ hasText: `${prefix} أحمد` })
    .getByRole('button', { name: 'مراجعة وقبول' })
    .click();
  await page.getByRole('button', { name: 'قبول الطلب وإضافة الطالب' }).click();
  await page
    .getByRole('dialog', { name: 'طلبات التسجيل' })
    .getByRole('button', { name: 'إغلاق النافذة' })
    .click();
  await page
    .locator('.student-card')
    .filter({ hasText: prefix })
    .getByRole('link', { name: 'عرض ملف الطالب' })
    .click();
  await page.getByRole('button', { name: 'تعديل الطالب', exact: true }).click();
  await expect(page.getByLabel('الفصل', { exact: true })).toHaveValue(`${prefix} أ`);
  await expect(page.getByLabel('الموهبة الرئيسية', { exact: true })).toHaveValue('البرمجة');
  await expect(page.getByLabel('مواهب إضافية (اختياري، كل موهبة في سطر، حتى 10)')).toHaveValue(
    `العزف ${prefix}`,
  );
  await page
    .getByLabel('معلومات عن الطالب وإنجازاته')
    .fill('شارك في إعداد موقع تعليمي لمراجعة الرياضيات.');
  await page.getByRole('button', { name: 'حفظ الطالب' }).click();
  await page.getByRole('button', { name: 'أعمال الطالب', exact: true }).click();
  await page.getByRole('button', { name: 'إضافة عمل', exact: true }).click();
  const work = page.getByRole('dialog', { name: 'إضافة عمل' });
  await work.getByLabel('عنوان العمل').fill('المراجعة التفاعلية');
  await work.getByLabel('دور الطالب في العمل').fill('تطوير الواجهة');
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#176ff1' } })
    .png()
    .toBuffer();
  await work
    .locator('input[type=file]')
    .setInputFiles({ name: 'portfolio.png', mimeType: 'image/png', buffer: png });
  await work.getByRole('button', { name: 'حفظ العمل' }).click();
  await expect(page.locator('.work-cover')).toBeVisible();
  await page.getByRole('button', { name: 'السيرة الذاتية', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'إنشاء السيرة بالذكاء الاصطناعي',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog', { name: 'مراجعة البيانات قبل الصياغة' })
    .getByRole('checkbox')
    .check();
  await page.getByRole('button', { name: 'بدء الصياغة', exact: true }).click();
  await expect(page.locator('.cv-paper')).toContainText('المراجعة التفاعلية');
  await expect(page.locator('.cv-official-header')).toContainText(
    'الإدارة العامة للتعليم بمنطقة المدينة المنورة',
  );
  await expect(page.locator('.cv-development')).toContainText('فهم المتغيرات');
  await expect(page.locator('.cv-paper')).toContainText('الأهداف المستقبلية');
  await expect(page.locator('.cv-paper')).toContainText('0501234567');
  await expect(page.locator('.cv-official-header')).toContainText('مجمع ثانوية قباء');
  await expect(page.getByRole('progressbar', { name: 'اكتمال بيانات الملف' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'شعار وزارة التعليم', exact: true })).toBeVisible();
  expect(
    await page
      .getByRole('img', { name: 'شعار وزارة التعليم', exact: true })
      .evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBe(4500);
  await expect(page.getByText('ملاحظات استكمال البيانات — لا تُطبع')).toBeVisible();
  await page.getByRole('button', { name: 'تحرير المسودة' }).click();
  const editor = page.getByRole('dialog', { name: 'تحرير مسودة السيرة' });
  await editor
    .getByLabel('النبذة', { exact: true })
    .fill('طالب مهتم بالبرمجة شارك في إعداد موقع تعليمي.');
  await expect(editor.locator('.editor-live-preview .cv-paper')).toContainText(
    'طالب مهتم بالبرمجة شارك',
  );
  await expect(editor.locator('.editor-save-state')).toContainText('تعديلات غير محفوظة');
  await editor.getByLabel('مهارة مقترحة 1', { exact: true }).fill('قراءة الشيفرة البرمجية البسيطة');
  await expect(editor.locator('.cv-development')).toContainText('قراءة الشيفرة البرمجية البسيطة');
  await editor.getByRole('button', { name: 'حذف الهدف المستقبلي 3', exact: true }).click();
  await expect(editor.getByLabel('هدف مستقبلي 3', { exact: true })).toHaveCount(0);
  await editor.evaluate((el) => {
    el.scrollTop = 0;
  });
  await editor.screenshot({
    path: resolve('backend/test-results/screenshots/cv-editor-desktop-light.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => editor.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await editor.getByRole('button', { name: 'عرض المعاينة المباشرة', exact: true }).click();
  await page.screenshot({
    path: resolve('backend/test-results/screenshots/cv-editor-mobile-light.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.once('dialog', (dialog) => dialog.dismiss());
  await editor.getByRole('button', { name: 'إغلاق النافذة' }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: 'اعتماد وحفظ' }).click();
  await page.getByRole('dialog', { name: 'اعتماد السيرة' }).getByRole('checkbox').check();
  await page
    .getByRole('dialog', { name: 'اعتماد السيرة' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'تنزيل PDF المعتمد' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.cv-paper')).toContainText('طالب مهتم بالبرمجة شارك');
  await expect(page.locator('.cv-development')).toContainText('قراءة الشيفرة البرمجية البسيطة');
  await expect(page.locator('.cv-supervisors')).toHaveCount(0);
  await page.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
  await page.screenshot({
    path: resolve('backend/test-results/screenshots/cv-approved-desktop-dark.png'),
    animations: 'disabled',
    fullPage: true,
  });
  const calls = fake.calls;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تنزيل PDF المعتمد' }).click();
  await expect.poll(async () => (await download).failure()).toBe(null);
  expect(fake.calls).toBe(calls);
  await page.getByRole('button', { name: 'إعادة الصياغة', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'مراجعة البيانات قبل الصياغة' })
    .getByRole('checkbox')
    .check();
  await page.getByRole('button', { name: 'بدء الصياغة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'معاينة المعتمدة' })).toBeVisible();
  await page.getByRole('button', { name: 'معاينة المعتمدة' }).click();
  await expect(page.locator('.cv-paper')).toContainText('طالب مهتم بالبرمجة شارك');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'تفعيل الوضع النهاري' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({
    path: resolve('backend/test-results/screenshots/cv-approved-mobile-light.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'العودة إلى الطلاب', exact: true }).click();
  await page.getByLabel(`تحديد ${prefix} أحمد للتصدير`, { exact: true }).check();
  const selected = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير المحددين (1)' }).click();
  expect(await (await selected).failure()).toBe(null);
  await page.getByLabel('البحث باسم الطالب').fill(prefix);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  const batch = page.waitForEvent('download');
  await page
    .getByRole('button', {
      name: 'تصدير السير المعتمدة لنتائج التصفية',
    })
    .click();
  expect(await (await batch).failure()).toBe(null);
  await page
    .locator('.student-card')
    .filter({ hasText: prefix })
    .getByRole('link', { name: 'عرض ملف الطالب' })
    .click();
  // Persist the previous schema shape to verify opening, approving and exporting old CVs.
  const savedStudent = await db.student.findFirstOrThrow({ where: { name: `${prefix} أحمد` } });
  const savedCv = await db.studentCv.findUniqueOrThrow({ where: { studentId: savedStudent.id } });
  const oldCv = cvSchema.parse(savedCv.draft);
  delete oldCv.suggestedSkills;
  delete oldCv.futureGoals;
  await db.studentCv.update({
    where: { studentId: savedStudent.id },
    data: { draft: oldCv, approved: oldCv },
  });
  await page.reload();
  await expect(page.locator('.cv-paper')).toBeVisible();
  await expect(page.locator('.cv-development')).toHaveCount(0);
  await page.getByRole('button', { name: 'اعتماد وحفظ' }).click();
  await page.getByRole('dialog', { name: 'اعتماد السيرة' }).getByRole('checkbox').check();
  await page
    .getByRole('dialog', { name: 'اعتماد السيرة' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  const oldDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تنزيل PDF المعتمد' }).click();
  expect(await (await oldDownload).failure()).toBe(null);
  await page.getByRole('button', { name: 'حذف الطالب', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'حذف الطالب' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.locator('.student-card').filter({ hasText: prefix })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Admin settings, fixed lists, Arabic search, yearly dashboard, rollover and explicit restore', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const suffix = randomUUID().slice(0, 8),
    className = `فصل ${suffix}`,
    talentName = `تصميم ${suffix}`,
    oldLabel = `عام ${suffix}`,
    newLabel = `التالي ${suffix}`;
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.account-menu summary').click();
  await page.getByRole('button', { name: 'إعدادات المدرسة', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'إعدادات المدرسة' });
  await settings.getByLabel('اسم السنة المفتوحة', { exact: true }).fill(oldLabel);
  await settings.getByRole('button', { name: 'حفظ اسم السنة', exact: true }).click();
  await expect(settings.getByLabel('اسم السنة المفتوحة', { exact: true })).toHaveValue(oldLabel);
  for (const [label, name] of [
    ['الفصل', className],
    ['الموهبة', talentName],
  ]) {
    const form = settings
      .locator('form')
      .filter({ has: page.getByLabel(`إضافة ${label}`, { exact: true }) });
    await form.getByLabel(`إضافة ${label}`, { exact: true }).fill(name!);
    await form.getByRole('button', { name: 'إضافة', exact: true }).click();
    await expect(settings.getByLabel(`تعديل ${label} ${name}`, { exact: true })).toBeVisible();
  }
  await settings.getByRole('button', { name: 'إغلاق النافذة' }).click();
  for (const [grade, name] of [
    ['FIRST', 'أحْمد'],
    ['SECOND', 'عمر'],
    ['THIRD', 'خالد'],
  ]) {
    await page.getByRole('button', { name: 'إضافة طالب', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'إضافة طالب' });
    await form.getByLabel('اسم الطالب', { exact: true }).fill(`${prefix} ${name} سنة`);
    await form.getByLabel('رقم الجوال', { exact: true }).fill('0501234567');
    await form.getByLabel('الصف', { exact: true }).selectOption(grade!);
    await form.getByLabel('الفصل', { exact: true }).fill(className);
    await form.getByLabel('الموهبة الرئيسية', { exact: true }).fill(talentName);
    await form.getByRole('button', { name: 'حفظ الطالب', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
  await page.getByLabel('البحث باسم الطالب').fill('احمد');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.locator('.student-card')).toHaveCount(1);
  await expect(page.locator('.student-card')).toContainText('أحْمد');
  await page.goto('/students');
  await expect(page.locator('.dashboard')).toContainText(oldLabel);
  await page.locator('.account-menu summary').click();
  await page.getByRole('button', { name: 'إعدادات المدرسة', exact: true }).click();
  await settings.getByRole('button', { name: 'إغلاق السنة وترحيل الطلاب', exact: true }).click();
  await expect(settings).toContainText('أول إلى ثانٍ: 1');
  await expect(settings).toContainText('ثانٍ إلى ثالث: 1');
  await expect(settings).toContainText('ثالث إلى الأرشيف: 1');
  await settings.getByLabel('اسم السنة الجديدة', { exact: true }).fill(newLabel);
  await settings.getByRole('button', { name: 'تأكيد الإغلاق والترحيل', exact: true }).click();
  await expect(settings.getByLabel('اسم السنة المفتوحة', { exact: true })).toHaveValue(newLabel);
  await settings.getByRole('button', { name: 'إغلاق النافذة' }).click();
  await expect(page.locator('.student-card')).toHaveCount(2);
  await expect(page.locator('.dashboard')).toContainText(newLabel);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({
    path: resolve('backend/test-results/screenshots/academic-dashboard-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: resolve('backend/test-results/screenshots/academic-dashboard-desktop.png'),
    fullPage: true,
  });
  await page.getByLabel('تصفية بالسنة').selectOption({ label: oldLabel + ' (مغلقة)' });
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.locator('.student-card')).toHaveCount(1);
  await expect(page.locator('.student-card')).toContainText('خالد');
  await page.locator('.student-card').getByRole('link', { name: 'عرض ملف الطالب' }).click();
  await expect(page.locator('.profile-heading')).toContainText('مؤرشف');
  await page.getByRole('button', { name: 'استعادة للسنة المفتوحة', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'استعادة طالب مؤرشف' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.locator('.profile-heading')).toContainText(newLabel);
  await expect(page.locator('.profile-heading')).toContainText('نشط');
  expect(errors).toEqual([]);
});
