import { existsSync, readFileSync } from 'node:fs';

// A secret can arrive inline (PEM or JSON), as a path to a local file, or as
// base64 — hosting dashboards mangle multi-line values, so base64 is the safe form there.
export function readSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // JSON first: a service account key is JSON with a PEM inside.
  if (trimmed.startsWith('{')) return trimmed;
  if (trimmed.includes('-----BEGIN')) return trimmed.replaceAll('\\n', '\n');
  if (existsSync(trimmed)) return readFileSync(trimmed, 'utf8');
  return Buffer.from(trimmed, 'base64').toString('utf8');
}
