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
        path: resolve(`backend/docs/screenshots/home-${width}-${theme}.png`),
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
