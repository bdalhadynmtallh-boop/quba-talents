import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { stdin, stdout } from 'node:process';
import { adminSetupSchema } from '@quba/shared';
import { createDatabase } from '../../plugins/database.js';
import { hashPassword } from '../../lib/password.js';
async function hiddenQuestion(label: string) {
  if (!stdin.isTTY) throw new Error('شغّل أمر إعداد المسؤول في طرفية تفاعلية.');
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) stdout.write(chunk);
      callback();
    },
  });
  const reader = createInterface({ input: stdin, output, terminal: true });
  stdout.write(label);
  muted = true;
  try {
    return await reader.question('');
  } finally {
    muted = false;
    reader.close();
    stdout.write('\n');
  }
}
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('أضف DATABASE_URL إلى backend/.env أولًا.');
  const reader = createInterface({ input: stdin, output: stdout });
  const name = await reader.question('اسم المسؤول: ');
  const email = await reader.question('البريد الإلكتروني: ');
  reader.close();
  const password = await hiddenQuestion('كلمة مرور (14 حرفًا على الأقل، لا تظهر أثناء الكتابة): ');
  const confirm = await hiddenQuestion('أعد كلمة المرور: ');
  if (password !== confirm) throw new Error('كلمتا المرور غير متطابقتين.');
  const input = adminSetupSchema.parse({ name, email, password });
  const db = createDatabase(url);
  try {
    const exists = await db.admin.findUnique({ where: { email: input.email } });
    if (exists) throw new Error('هذا المسؤول موجود. لم يتم تغيير بياناته.');
    await db.admin.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
      },
    });
    console.log('تم إنشاء المسؤول بأمان.');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'تعذر إعداد المسؤول. تحقق من المدخلات (اسم وبريد صحيح وكلمة مرور 14 حرفًا) واتصال قاعدة البيانات وعدم تكرار البريد.',
  );
  process.exitCode = 1;
});
