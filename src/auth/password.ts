import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const LOG_N = 15;
const R = 8;
const P = 3;
// scrypt needs 128 * N * r bytes; Node's 32 MB default rejects N = 2^15.
const MAX_MEMORY = 128 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  logN: number,
  r: number,
  p: number,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: 2 ** logN, r, p, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, LOG_N, R, P, KEY_LENGTH);
  return [
    'scrypt',
    LOG_N,
    R,
    P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, logN, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const params = [Number(logN), Number(r), Number(p)];
  if (expected.length === 0 || params.some((n) => !Number.isInteger(n)))
    return false;
  try {
    const actual = await derive(
      password,
      Buffer.from(salt, 'base64'),
      params[0],
      params[1],
      params[2],
      expected.length,
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
