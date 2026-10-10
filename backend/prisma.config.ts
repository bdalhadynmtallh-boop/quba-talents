import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { fileURLToPath } from 'node:url';
const databaseUrl = new URL(env('DATABASE_URL'));
// Prisma's migration engine uses different CA options from the Node pg adapter.
if (
  databaseUrl.hostname.endsWith('.supabase.co') ||
  databaseUrl.hostname.endsWith('.pooler.supabase.com')
) {
  databaseUrl.searchParams.set('sslmode', 'require');
  databaseUrl.searchParams.set('sslaccept', 'strict');
  databaseUrl.searchParams.set(
    'sslcert',
    fileURLToPath(new URL('./assets/certs/supabase-ca.crt', import.meta.url)),
  );
}
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl.href },
});
