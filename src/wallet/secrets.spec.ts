import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSecret } from './secrets.js';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('readSecret', () => {
  it('is undefined when the variable is missing or blank', () => {
    expect(readSecret(undefined)).toBeUndefined();
    expect(readSecret('   ')).toBeUndefined();
  });

  it('takes an inline PEM, restoring escaped line breaks', () => {
    expect(readSecret(PEM)).toBe(PEM);
    expect(readSecret(PEM.replaceAll('\n', '\\n'))).toBe(PEM);
  });

  it('leaves a service account JSON untouched, PEM inside included', () => {
    const json = JSON.stringify({ client_email: 'a@b.c', private_key: PEM });
    expect(JSON.parse(readSecret(json)!)).toEqual({
      client_email: 'a@b.c',
      private_key: PEM,
    });
  });

  it('decodes base64, the form a hosting dashboard keeps intact', () => {
    expect(readSecret(Buffer.from(PEM).toString('base64'))).toBe(PEM);
  });

  it('reads a local file when given its path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fidelify-secret-'));
    const file = join(dir, 'pass.pem');
    writeFileSync(file, PEM);
    expect(readSecret(file)).toBe(PEM);
    rmSync(dir, { recursive: true, force: true });
  });
});
