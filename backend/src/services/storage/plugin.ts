import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import { FILE_LIMIT, MAX_ATTACHMENTS } from '@quba/shared';
import type { Environment } from '../../config/env.js';
import { LocalStorage } from './local.js';
declare module 'fastify' {
  interface FastifyInstance {
    storage: LocalStorage;
  }
}
export const storagePlugin = fp<{ env: Environment }>(async (app, { env }) => {
  app.decorate('storage', new LocalStorage(env.STORAGE_DIR));
  await app.register(multipart, {
    limits: {
      fileSize: FILE_LIMIT,
      files: MAX_ATTACHMENTS,
      fields: 1,
      fieldSize: 32768,
      parts: MAX_ATTACHMENTS + 1,
    },
    throwFileSizeLimit: true,
  });
  let running = false;
  let timer: NodeJS.Timeout | undefined;
  const maintain = async () => {
    if (running) return;
    running = true;
    try {
      await app.storage.maintain(app.db);
    } catch {
      app.log.warn({ code: 'STORAGE_RETRY' }, 'Storage maintenance will retry');
    } finally {
      running = false;
    }
  };
  app.addHook('onReady', async () => {
    await maintain();
    timer = setInterval(() => void maintain(), 60000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
});
