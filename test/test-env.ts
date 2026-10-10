import 'dotenv/config';

function deriveTestDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error('DATABASE_URL is required to derive the test database');
  const url = new URL(base);
  url.pathname = '/fidelify_test';
  return url.toString();
}

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? deriveTestDatabaseUrl();

export const testEnv = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
  NODE_ENV: 'test',
};
