import fp from 'fastify-plugin';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Environment } from '../config/env.js';
declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
  }
}
export const createDatabase = (url: string) =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    }),
  });
export const databasePlugin = fp<{ env: Environment }>(async (app, { env }) => {
  const db = createDatabase(env.DATABASE_URL);
  await db.$connect();
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await db.$disconnect();
  });
});
