import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('accepts the password it hashed', async () => {
    const stored = await hashPassword('heladeria-demo-2026');
    expect(await verifyPassword('heladeria-demo-2026', stored)).toBe(true);
  });

  it('rejects a different password', async () => {
    const stored = await hashPassword('heladeria-demo-2026');
    expect(await verifyPassword('heladeria-demo-2027', stored)).toBe(false);
  });

  it('never stores the password and salts every hash', async () => {
    const first = await hashPassword('heladeria-demo-2026');
    const second = await hashPassword('heladeria-demo-2026');
    expect(first).not.toContain('heladeria-demo-2026');
    expect(first).not.toBe(second);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$15$8$3$c2FsdA==$')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$a$8$3$c2FsdA==$aGFzaA==')).toBe(
      false,
    );
  });
});
