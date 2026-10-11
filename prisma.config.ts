import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // The CLI (migrations) needs a direct connection; the app itself uses
  // DATABASE_URL, which in production points at the connection pooler.
  datasource: { url: process.env.DIRECT_URL || env('DATABASE_URL') },
});
