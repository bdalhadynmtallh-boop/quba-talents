import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
for (const path of ['.env', 'backend/.env']) {
  let exists = false;
  try {
    await access(path);
    exists = true;
  } catch {
    /* Missing is expected. */
  }
  if (exists) throw new Error(`لن تُستبدل الإعدادات الموجودة: ${path}`);
}
const password = randomBytes(24).toString('base64url'),
  secret = randomBytes(32).toString('hex');
await writeFile(
  '.env',
  `POSTGRES_DB=quba_talents\nPOSTGRES_USER=quba\nPOSTGRES_PORT=5432\nPOSTGRES_PASSWORD=${password}\n`,
  { flag: 'wx' },
);
await writeFile(
  'backend/.env',
  `DATABASE_URL=postgresql://quba:${password}@localhost:5432/quba_talents\nCOOKIE_SECRET=${secret}\nNODE_ENV=development\nHOST=127.0.0.1\nPORT=3001\nAPP_ORIGIN=http://localhost:5186\nSESSION_HOURS=8\nSTORAGE_DIR=.data/uploads\n`,
  { flag: 'wx' },
);
console.log('أُنشئت الإعدادات المحلية عشوائيًا دون عرض الأسرار. إعداد المسؤول خطوة منفصلة.');
