import { buildApp } from './app.js';
import { loadEnvironment } from './config/env.js';
async function start() {
  const env = loadEnvironment();
  const app = await buildApp(env);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  await app.listen({ host: env.HOST, port: env.PORT });
}
start().catch(() => {
  console.error('تعذر تشغيل الخادم. تحقق من إعدادات البيئة واتصال PostgreSQL والمنفذ.');
  process.exitCode = 1;
});
