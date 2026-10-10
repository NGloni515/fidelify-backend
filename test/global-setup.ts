import { execSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DATABASE_URL } from './test-env.js';

export default async function setup() {
  const database = new URL(TEST_DATABASE_URL).pathname.slice(1);
  // The suite truncates every table; never let it point at a real database.
  if (!database.endsWith('_test'))
    throw new Error(`Refusing to run e2e tests against "${database}"`);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const existing = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [database],
  );
  if (existing.rowCount === 0)
    await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
