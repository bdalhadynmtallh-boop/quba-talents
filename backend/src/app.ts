import Fastify, { LogController } from 'fastify';
import type { Environment } from './config/env.js';
import { registerErrorHandler } from './lib/errors.js';
import { securityPlugin } from './plugins/security.js';
import { databasePlugin } from './plugins/database.js';
import { authPlugin } from './plugins/auth.js';
import { storagePlugin } from './services/storage/plugin.js';
import { authRoutes } from './modules/auth/routes.js';
import { studentRoutes } from './modules/students/routes.js';
import { registrationRoutes } from './modules/registrations/routes.js';
import { workRoutes } from './modules/works/routes.js';
import { schoolRoutes } from './modules/school/routes.js';
import { cvRoutes } from './modules/cv/routes.js';
import { academicYearRoutes } from './modules/academic-years/routes.js';
import { catalogRoutes } from './modules/school/catalog-routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { QwenTextAi, type TextAi } from './services/ai/qwen.js';
import { ChromiumPdf, type PdfRenderer } from './services/pdf/chromium.js';
export async function buildApp(
  env: Environment,
  testServices?: { ai?: TextAi; pdf?: PdfRenderer },
) {
  if (testServices && env.NODE_ENV !== 'test')
    throw new Error('Service overrides are restricted to tests.');
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      env.NODE_ENV !== 'test'
        ? {
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
          }
        : false,
    bodyLimit: 32768,
    trustProxy: false,
  });
  registerErrorHandler(app);
  await app.register(securityPlugin, { env });
  await app.register(databasePlugin, { env });
  await app.register(authPlugin, { env });
  await app.register(storagePlugin, { env });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.db.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', message: 'قاعدة البيانات غير متاحة.' });
    }
  });
  await app.register(
    async (api) => {
      await authRoutes(api, env);
      await studentRoutes(api);
      await registrationRoutes(api);
      await workRoutes(api);
      await schoolRoutes(api);
      await academicYearRoutes(api);
      await catalogRoutes(api);
      await dashboardRoutes(api);
      await cvRoutes(api, env, {
        ai: testServices?.ai ?? new QwenTextAi(env),
        pdf: testServices?.pdf ?? new ChromiumPdf(env),
      });
    },
    { prefix: '/api' },
  );
  return app;
}
