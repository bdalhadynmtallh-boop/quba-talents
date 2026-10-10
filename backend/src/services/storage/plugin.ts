import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import { FILE_LIMIT, MAX_ATTACHMENTS } from '@quba/shared';
import type { Environment } from '../../config/env.js';
import { LocalStorage } from './local.js';
import { SupabaseStorage } from './supabase.js';
import type { ManagedStorage } from './base.js';
declare module 'fastify' {
  interface FastifyInstance {
    storage: ManagedStorage;
  }
}
export const storagePlugin = fp<{ env: Environment }>(async (app, { env }) => {
  app.decorate<ManagedStorage>(
    'storage',
    env.STORAGE_PROVIDER === 'supabase'
      ? new SupabaseStorage(
          env.SUPABASE_URL!,
          env.SUPABASE_SERVICE_KEY!,
          env.SUPABASE_STORAGE_BUCKET,
        )
      : new LocalStorage(env.STORAGE_DIR),
  );
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
    await app.storage.initialize();
    await maintain();
    timer = setInterval(() => void maintain(), 60000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
});
