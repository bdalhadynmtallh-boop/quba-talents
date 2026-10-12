import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

test.use({ baseURL: 'http://localhost:5188' });
let web: ChildProcess;
test.beforeAll(async () => {
  web = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], {
    cwd: resolve('frontend'),
    env: { ...process.env, WEB_PORT: '5188' },
    stdio: 'ignore',
    windowsHide: true,
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch('http://localhost:5188')).ok;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
});
test.afterAll(() => {
  web?.kill();
});

test('Home is responsive, truthful, accessible and respects reduced motion in both themes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The public homepage only reads auth state; no student data is mocked or published.
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { admin: null } }));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 780 ? 1000 : 844 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.goto('/');
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('شغفك اليوم');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('.talent-card')).toHaveCount(6);
      await expect(page.locator('.journey-card')).toHaveCount(3);
      await expect(page.locator('.hero-buttons a').first()).toHaveAttribute('href', '/register');
      await expect(page.locator('.hero-buttons a').last()).toHaveAttribute('href', '/students');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await expect(page.locator('.talents-section')).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: resolve(`backend/test-results/screenshots/home-${width}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.journey-section').scrollIntoViewIfNeeded();
  await expect(page.locator('.journey-section')).toHaveCSS('opacity', '1');
  await page.getByRole('link', { name: 'تسجيل الموهبة', exact: true }).last().click();
  await expect(page).toHaveURL(/\/register$/);
  expect(errors).toEqual([]);
});

test('Registration requires a phone number and the new name fits mobile screens', async ({
  page,
}) => {
  let submitted: { phoneNumber: string } | undefined;
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { admin: null } }));
  await page.route('**/api/auth/csrf', (route) => route.fulfill({ json: { token: 'test-token' } }));
  await page.route('**/api/registrations', async (route) => {
    submitted = route.request().postDataJSON() as { phoneNumber: string };
    await route.fulfill({ status: 201, json: { message: 'تم إرسال الطلب.' } });
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/register');
    await expect(page).toHaveTitle('موهوبين مجمع ثانوية قباء');
    await expect(page.locator('.brand')).toContainText('موهوبين مجمع ثانوية قباء');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  const phone = page.getByLabel('رقم الجوال', { exact: true });
  await page.getByLabel('اسم الطالب', { exact: true }).fill('طالب تجريبي');
  await page.getByLabel('الصف', { exact: true }).selectOption('SECOND');
  await page.getByLabel('الفصل', { exact: true }).fill('أ');
  await page.getByLabel('الموهبة الرئيسية', { exact: true }).fill('الرسم');
  await page.getByLabel('وصف مختصر للموهبة').fill('أحب الرسم والمشاركة في معرض المدرسة.');
  await page.getByRole('button', { name: 'إرسال طلب التسجيل' }).click();
  expect(submitted).toBeUndefined();
  expect(await phone.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await phone.fill('123');
  await page.getByRole('button', { name: 'إرسال طلب التسجيل' }).click();
  await expect(page.getByRole('alert')).toContainText('أدخل رقم جوال صحيحًا');
  expect(submitted).toBeUndefined();
  await phone.fill('٠٥٠ ١٢٣-٤٥٦٧');
  await page.getByRole('button', { name: 'إرسال طلب التسجيل' }).click();
  await expect(page.getByRole('heading', { name: 'وصلت موهبتك إلينا!' })).toBeVisible();
  expect(submitted?.phoneNumber).toBe('0501234567');
});
