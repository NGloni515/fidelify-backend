import { randomBytes } from 'node:crypto';

/** Serial corto y legible para el QR del pase (sin caracteres ambiguos). */
export function newSerialNumber(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FL-${out}`;
}

/** Token que Apple Wallet usa para autenticarse contra nuestro web service. */
export function newAuthToken(): string {
  return randomBytes(24).toString('hex');
}
