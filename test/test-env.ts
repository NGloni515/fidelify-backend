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

export const WALLET_ENV = [
  'PUBLIC_API_URL',
  'GOOGLE_WALLET_ISSUER_ID',
  'GOOGLE_WALLET_SERVICE_ACCOUNT',
  'APPLE_PASS_TYPE_ID',
  'APPLE_TEAM_ID',
  'APPLE_PASS_CERT',
  'APPLE_PASS_KEY',
  'APPLE_PASS_KEY_PASSPHRASE',
  'APPLE_WWDR_CERT',
] as const;

export const testEnv = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
  NODE_ENV: 'test',
  // Blanked so a developer's real credentials in .env never reach a test:
  // a value already in the environment wins over the file.
  ...Object.fromEntries(WALLET_ENV.map((key) => [key, ''])),
};
