import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/plugins/database.js';
import { LocalStorage } from '../src/services/storage/local.js';
import type { TextAi } from '../src/services/ai/qwen.js';
import { testDefaults } from './env.js';
import { requireTestDatabaseUrl } from './isolation.js';

export async function startBrowserFixture(webPort: number, apiPort: number, ai?: TextAi) {
  if (process.env.BROWSER_TESTS_ALLOW_DB_WRITE !== 'yes')
    throw new Error('Browser writes must be explicitly enabled for a dedicated test database.');
  const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const origin = `http://localhost:${webPort}`;
  const storageRoot = resolve('backend/.data', `browser-${randomUUID()}`);
  const env = {
    ...testDefaults,
    NODE_ENV: 'test' as const,
    DATABASE_URL: databaseUrl,
    COOKIE_SECRET: randomUUID() + randomUUID(),
    APP_ORIGIN: origin,
    HOST: '127.0.0.1',
    PORT: apiPort,
    SESSION_HOURS: 8,
    STORAGE_DIR: storageRoot,
  };
  const db = createDatabase(databaseUrl);
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let web: ChildProcess | undefined;
  const close = async () => {
    web?.kill();
    await app?.close();
    await db.$disconnect();
  };
  try {
    app = await buildApp(env, ai ? { ai } : undefined);
    await app.listen({ host: env.HOST, port: apiPort });
    web = spawn(
      process.execPath,
      [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
      {
        cwd: resolve('frontend'),
        env: {
          ...process.env,
          WEB_PORT: String(webPort),
          API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
        },
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 75; attempt++) {
      if (web.exitCode !== null) throw new Error('Isolated frontend exited before startup.');
      try {
        if ((await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Retry during startup. */
      }
      await new Promise((done) => setTimeout(done, 200));
    }
    if (!ready) throw new Error('Isolated browser fixture failed to start.');
    return { db, app, env, storage: new LocalStorage(storageRoot), storageRoot, close };
  } catch (error) {
    await close();
    throw error;
  }
}
