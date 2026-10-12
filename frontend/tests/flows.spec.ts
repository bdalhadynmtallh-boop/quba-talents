import { testCatalog } from '../../backend/tests/catalog.js';
import { test, expect, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { createDatabase } from '../../backend/src/plugins/database.js';
import { startBrowserFixture } from '../../backend/tests/browser-fixture.js';
import { hashPassword } from '../../backend/src/lib/password.js';
import { LocalStorage } from '../../backend/src/services/storage/local.js';
const prefix = `اختبار متصفح ${randomUUID().slice(0, 8)}`;
const password = randomBytes(20).toString('base64url'),
  email = `browser-${randomUUID()}@example.test`;
test.use({ baseURL: 'http://localhost:5189' });
let fixture: Awaited<ReturnType<typeof startBrowserFixture>> | undefined;
let db: ReturnType<typeof createDatabase>, storage: LocalStorage, adminId: string;
const screenshotRoot = resolve('backend/test-results/screenshots');
test.beforeAll(async () => {
  fixture = await startBrowserFixture(5189, 3003);
  db = fixture.db;
  storage = fixture.storage;
  await testCatalog(db);
  await db.supervisor.deleteMany({ where: { schoolId: 'school' } });
  const admin = await db.admin.create({
    data: {
      email,
      name: 'مسؤول اختبار المتصفح',
      passwordHash: await hashPassword(password),
    },
  });
  adminId = admin.id;
  await mkdir(screenshotRoot, { recursive: true });
});
test.afterAll(async () => {
  if (!db) return;
  const students = await db.student.findMany({
    where: { name: { startsWith: prefix } },
    include: { works: { include: { attachments: true } } },
  });
  await db.$transaction(async (tx) => {
    const keys = students.flatMap((student) =>
      student.works.flatMap((work) => work.attachments.map((file) => file.storageKey)),
    );
    if (keys.length)
      await tx.storageDeletion.createMany({
        data: keys.map((storageKey) => ({ storageKey })),
        skipDuplicates: true,
      });
    await tx.registrationRequest.deleteMany({ where: { name: { startsWith: prefix } } });
    await tx.student.deleteMany({ where: { name: { startsWith: prefix } } });
    if (adminId) await tx.admin.deleteMany({ where: { id: adminId } });
  });
  await storage.maintain(db);
  await fixture?.close();
});
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/students$/);
}
async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}
test('Expired administrative session removes private content immediately', async ({ page }) => {
  await login(page);
  await db.session.deleteMany({ where: { adminId } });
  await page.getByRole('button', { name: 'طلبات التسجيل', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ملفات الطلاب خاصة', exact: true })).toBeVisible();
  await expect(page.locator('.registration-card')).toHaveCount(0);
  await expect(page.locator('.student-card')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('Desktop: registration, approval, student editing, works upload/deletion, settings and logout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /شغفك اليوم/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await noOverflow(page);
  await page.screenshot({
    path: resolve(screenshotRoot, 'home-desktop-light.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: resolve(screenshotRoot, 'home-desktop-dark.png'), fullPage: true });
  await page.goto('/students');
  await expect(page.getByRole('heading', { name: 'ملفات الطلاب خاصة' })).toBeVisible();
  await page.goto('/register');
  await page.getByLabel('اسم الطالب', { exact: true }).fill(`${prefix} أحمد`);
  await page.getByLabel('رقم الجوال', { exact: true }).fill('٠٥٠ ١٢٣ ٤٥٦٧');
  await page.getByLabel('الصف', { exact: true }).selectOption('SECOND');
  await page.getByLabel('الفصل', { exact: true }).fill('أ');
  await page.getByLabel('الموهبة الرئيسية', { exact: true }).fill('البرمجة');
  await page.getByLabel('وصف مختصر للموهبة').fill('أحب البرمجة وتطوير المواقع التعليمية.');
  await page.getByRole('button', { name: 'إرسال طلب التسجيل' }).click();
  await expect(page.getByRole('heading', { name: 'وصلت موهبتك إلينا!' })).toBeVisible();
  await login(page);
  await page.getByRole('button', { name: 'طلبات التسجيل', exact: true }).click();
  const requests = page.getByRole('dialog', { name: 'طلبات التسجيل' });
  await requests
    .locator('.registration-card')
    .filter({ hasText: `${prefix} أحمد` })
    .getByRole('button', { name: 'مراجعة وقبول' })
    .click();
  const review = page.getByRole('dialog', { name: 'مراجعة طلب التسجيل' });
  await expect(review.getByLabel('اسم الطالب', { exact: true })).toHaveValue(`${prefix} أحمد`);
  await expect(review.getByLabel('رقم الجوال', { exact: true })).toHaveValue('0501234567');
  await review.getByRole('button', { name: 'قبول الطلب وإضافة الطالب' }).click();
  await expect(page.getByRole('dialog', { name: 'طلبات التسجيل' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'إغلاق النافذة' }).click();
  const card = page.locator('.student-card').filter({ hasText: `${prefix} أحمد` });
  await expect(card).toHaveCount(1);
  await page.getByLabel('البحث باسم الطالب').fill(`${prefix} أحمد`);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.locator('.student-card')).toHaveCount(1);
  await card.getByRole('link', { name: 'عرض ملف الطالب' }).click();
  await expect(page.getByRole('heading', { name: 'لم تُنشأ السيرة بعد' })).toBeVisible();
  await page.getByRole('button', { name: 'تعديل الطالب', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'تعديل الطالب' });
  await expect(edit.getByLabel('رقم الجوال', { exact: true })).toHaveValue('0501234567');
  await edit.getByLabel('رقم الجوال', { exact: true }).fill('+966501234568');
  await edit.getByLabel('اسم الطالب', { exact: true }).fill(`${prefix} أحمد معدل`);
  await edit.getByLabel('معلومات عن الطالب وإنجازاته').fill('نفّذ مشروعًا ضمن فريق المدرسة.');
  await edit.getByRole('button', { name: 'حفظ الطالب' }).click();
  await expect(
    page.getByRole('heading', { name: `${prefix} أحمد معدل`, exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('.student-summary')).toContainText('+966501234568');
  await page.getByRole('button', { name: 'أعمال الطالب', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'لم تُضف أعمال بعد' })).toBeVisible();
  await page.getByRole('button', { name: 'إضافة عمل', exact: true }).click();
  const work = page.getByRole('dialog', { name: 'إضافة عمل' });
  await work.getByLabel('عنوان العمل').fill('مشروع متصفح تجريبي');
  await work
    .getByLabel('وصف العمل')
    .fill('رفع صورة فعلية من الواجهة إلى PostgreSQL ومساحة الملفات.');
  await work.getByLabel('دور الطالب في العمل').fill('برمجة الواجهة');
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#176ff1' } })
    .png()
    .toBuffer();
  await work
    .locator('input[type=file]')
    .setInputFiles({ name: 'browser.png', mimeType: 'image/png', buffer: png });
  await work.getByRole('button', { name: 'حفظ العمل' }).click();
  await expect(page.locator('.work-card')).toHaveCount(1);
  await expect(page.locator('.work-cover')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.work-cover').evaluate((image: HTMLImageElement) => image.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({
    path: resolve(screenshotRoot, 'works-desktop-dark.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'تعديل العمل', exact: true }).click();
  const workEdit = page.getByRole('dialog', { name: 'تعديل العمل' });
  await workEdit.getByLabel('دور الطالب في العمل').fill('تطوير الواجهة واختبار المشروع');
  await workEdit.getByRole('button', { name: 'حفظ العمل' }).click();
  await expect(page.locator('.work-card')).toContainText('تطوير الواجهة واختبار المشروع');
  await page.getByRole('button', { name: 'حذف المرفق browser.png' }).click();
  await page
    .getByRole('dialog', { name: 'تأكيد الحذف' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.locator('.attachment-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'إضافة عمل', exact: true }).click();
  const invalid = page.getByRole('dialog', { name: 'إضافة عمل' });
  await invalid.getByLabel('عنوان العمل').fill('ملف غير مسموح');
  await invalid.locator('input[type=file]').setInputFiles({
    name: 'file.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<html>not allowed</html>'),
  });
  await invalid.getByRole('button', { name: 'حفظ العمل' }).click();
  await expect(invalid.getByRole('alert')).toContainText('غير مسموح');
  await invalid.getByRole('button', { name: 'إغلاق النافذة' }).click();
  await expect(page.locator('.work-card')).toHaveCount(1);
  await page.locator('.account-menu summary').click();
  await page.getByRole('button', { name: 'إعدادات المدرسة' }).click();
  const settings = page.getByRole('dialog', { name: 'إعدادات المدرسة' });
  await expect(settings.getByLabel('اسم المدرسة', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'إضافة مشرف', exact: true }).click();
  await expect(settings.getByLabel('اسم المشرف 1', { exact: true })).toBeVisible();
  await settings.getByLabel('اسم المشرف 1', { exact: true }).fill('مشرف اختبار');
  await settings.getByLabel('مسمى المشرف 1', { exact: true }).fill('متابعة المواهب');
  await settings.getByRole('button', { name: 'حفظ الإعدادات' }).click();
  await expect(settings).toHaveCount(0);
  await page.getByRole('button', { name: 'حذف العمل مشروع متصفح تجريبي' }).click();
  await page
    .getByRole('dialog', { name: 'تأكيد الحذف' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'لم تُضف أعمال بعد' })).toBeVisible();
  await page.getByRole('button', { name: 'حذف الطالب', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'حذف الطالب' })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(
    page.locator('.student-card').filter({ hasText: `${prefix} أحمد معدل` }),
  ).toHaveCount(0);
  if ((await page.locator('.account-menu').getAttribute('open')) === null)
    await page.locator('.account-menu summary').click();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await page.goto('/students');
  await expect(page.getByRole('heading', { name: 'ملفات الطلاب خاصة' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('Mobile: system theme, persistent theme choice, keyboard modal and error state', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await noOverflow(page);
  await page.screenshot({ path: resolve(screenshotRoot, 'home-mobile-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'تفعيل الوضع النهاري' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await noOverflow(page);
  await page.screenshot({ path: resolve(screenshotRoot, 'home-mobile-light.png'), fullPage: true });
  await page.goto('/register');
  await noOverflow(page);
  await expect(page.getByLabel('وصف مختصر للموهبة')).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotRoot, 'registration-mobile-light.png'),
    fullPage: true,
  });
  await login(page);
  await noOverflow(page);
  await page.getByRole('button', { name: 'إضافة طالب', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'إضافة طالب' });
  await dialog.locator('input[name=phoneNumber]').fill('0501234567');
  await dialog.getByLabel('اسم الطالب', { exact: true }).fill(`${prefix} جوال`);
  await dialog.getByLabel('الفصل', { exact: true }).fill('ب');
  await dialog.getByLabel('الموهبة الرئيسية', { exact: true }).fill('الرسم');
  await noOverflow(page);
  await dialog.getByRole('button', { name: 'حفظ الطالب' }).click();
  await expect(page.locator('.student-card').filter({ hasText: `${prefix} جوال` })).toHaveCount(1);
  await page.screenshot({
    path: resolve(screenshotRoot, 'students-mobile-light.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'إضافة طالب', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.route('**/api/students?*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'خطأ اختبار مؤقت', code: 'TEST' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'تعذر تحميل البيانات' })).toBeVisible();
  await expect(page.getByText('خطأ اختبار مؤقت')).toBeVisible();
  await page.unroute('**/api/students?*');
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.locator('.student-card').filter({ hasText: `${prefix} جوال` })).toHaveCount(1);
  expect(errors).toEqual([]);
});
