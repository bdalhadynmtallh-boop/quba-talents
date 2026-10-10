import { chromium, type Browser } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { printTemplate, type PrintableCv } from './template.js';
import { normalizePdfUnicode } from './unicode.js';
export interface PdfRenderer {
  render(items: PrintableCv[], logo?: string): Promise<Buffer>;
}
const require = createRequire(import.meta.url);
export class ChromiumPdf implements PdfRenderer {
  private active = false;
  constructor(private env: Environment) {}
  async render(items: PrintableCv[], logo?: string) {
    if (this.active)
      throw new AppError(429, 'PDF_BUSY', 'يوجد تصدير جارٍ. انتظر اكتماله ثم أعد المحاولة.');
    if (!items.length || items.length > 20)
      throw new AppError(400, 'PDF_BATCH', 'اختر من 1 إلى 20 سيرة معتمدة.');
    this.active = true;
    let browser: Browser | undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      const operation = async () => {
        const fonts = await Promise.all(
          [400, 600].map((weight) =>
            readFile(
              require.resolve(
                `@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`,
              ),
            ),
          ),
        );
        const ministryLogo = await readFile(
          new URL('../../../assets/branding/ministry-education.png', import.meta.url),
        );
        browser = await chromium.launch({
          headless: true,
          executablePath: this.env.CHROMIUM_EXECUTABLE_PATH,
          timeout: 15000,
        });
        const context = await browser.newContext({ javaScriptEnabled: false });
        await context.route('**/*', (route) => route.abort());
        const page = await context.newPage();
        await page.setContent(
          printTemplate(
            items,
            fonts[0]!.toString('base64'),
            fonts[1]!.toString('base64'),
            logo,
            `data:image/png;base64,${ministryLogo.toString('base64')}`,
          ),
          { waitUntil: 'load', timeout: 15000 },
        );
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.images).map((image) => image.decode()));
        });
        const result = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          tagged: true,
          outline: true,
          scale: 1,
        });
        if (result.length > 20 * 1024 * 1024)
          throw new AppError(413, 'PDF_SIZE', 'ملف التصدير كبير؛ اختر دفعة أصغر.');
        return normalizePdfUnicode(result);
      };
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AppError(504, 'PDF_TIMEOUT', 'انتهت مهلة التصدير؛ جرّب دفعة أصغر.')),
            60000,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'PDF_UNAVAILABLE',
        'تعذر تجهيز PDF. تأكد من تثبيت Chromium والخطوط المحلية على الخادم.',
      );
    } finally {
      if (timer) clearTimeout(timer);
      await browser?.close().catch(() => {});
      this.active = false;
    }
  }
}
