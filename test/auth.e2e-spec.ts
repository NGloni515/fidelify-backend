import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import {
  createBusiness,
  resetDatabase,
  STAFF_PASSWORD,
} from './helpers/fixtures.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;

  const credentials = () => ({
    email: less.cashier.email,
    password: STAFF_PASSWORD,
  });
  const refreshCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((cookie) => cookie.startsWith('fidelify_refresh='));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    less = await createBusiness(prisma, 'less');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('opens a session and never returns the password hash', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user).toEqual({
        id: less.cashier.id,
        name: 'Caja less',
        email: 'caja@less.test',
        role: 'CASHIER',
        branchId: less.branch.id,
        business: { id: less.business.id, name: 'Negocio less', slug: 'less' },
      });
      expect(JSON.stringify(res.body)).not.toContain('scrypt');
    });

    it('keeps the refresh token in an HttpOnly cookie, out of the body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(200);

      const cookie = refreshCookie(res);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');
      expect(cookie).toContain('SameSite=Lax');
      expect(res.body.refreshToken).toBeUndefined();
    });

    it('accepts the email in any casing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ ...credentials(), email: 'Caja@LESS.test' })
        .expect(200);
    });

    it('answers the same for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ ...credentials(), password: 'otra-clave' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ ...credentials(), email: 'nadie@less.test' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(
        'Correo o contraseña incorrectos',
      );
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('rejects a deactivated staff member', async () => {
      await prisma.staffUser.update({
        where: { id: less.cashier.id },
        data: { active: false },
      });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(401);
      expect(res.body.message).toBe('Correo o contraseña incorrectos');
    });

    it('rejects staff of a deactivated business', async () => {
      await prisma.business.update({
        where: { id: less.business.id },
        data: { active: false },
      });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(401);
    });

    it('rejects a field the DTO does not declare', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ ...credentials(), role: 'OWNER' })
        .expect(400);
    });
  });

  describe('session', () => {
    it('GET /api/auth/me needs a token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer no-es-un-token')
        .expect(401);
    });

    it('renews the access token from the cookie alone', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send(credentials()).expect(200);

      const renewed = await agent.post('/api/auth/refresh').expect(200);
      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${renewed.body.accessToken}`)
        .expect(200);

      expect(me.body.email).toBe('caja@less.test');
    });

    it('does not renew without the cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .expect(401);
      expect(res.body.message).toBe('Tu sesión venció. Vuelve a entrar.');
    });

    it('does not accept an access token as a refresh token, nor the reverse', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(200);
      const refreshToken = refreshCookie(login)!.split(';')[0].split('=')[1];

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `fidelify_refresh=${login.body.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });

    it('cuts a deactivated staff member on the next request', async () => {
      const agent = request.agent(app.getHttpServer());
      const login = await agent
        .post('/api/auth/login')
        .send(credentials())
        .expect(200);

      await prisma.staffUser.update({
        where: { id: less.cashier.id },
        data: { active: false },
      });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(401);
      await agent.post('/api/auth/refresh').expect(401);
    });

    it('logout clears the cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send(credentials()).expect(200);

      const res = await agent.post('/api/auth/logout').expect(204);

      expect(refreshCookie(res)).toMatch(/^fidelify_refresh=;/);
      await agent.post('/api/auth/refresh').expect(401);
    });
  });

  // The attempt counts live in the app for its whole life, so every test here
  // uses accounts no other test touches.
  describe('attempt limit', () => {
    const login = (email: string, password: string) =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });

    it('blocks an account after 5 failed attempts, even with the right password', async () => {
      const { cashier } = await createBusiness(prisma, 'bloqueo');
      for (let i = 0; i < 5; i++)
        await login(cashier.email, 'otra-clave').expect(401);

      const res = await login(cashier.email, STAFF_PASSWORD).expect(429);
      expect(res.body.message).toBe(
        'Demasiados intentos. Vuelve a intentar en 15 minutos.',
      );
    });

    it('blocks an unknown email the same way, so it does not reveal which exist', async () => {
      for (let i = 0; i < 5; i++)
        await login('nadie@bloqueo.test', 'otra-clave').expect(401);
      await login('nadie@bloqueo.test', 'otra-clave').expect(429);
    });

    it('counts the email in any casing as the same account', async () => {
      const { cashier } = await createBusiness(prisma, 'mayusculas');
      for (let i = 0; i < 5; i++)
        await login(cashier.email.toUpperCase(), 'otra-clave').expect(401);
      await login(cashier.email, STAFF_PASSWORD).expect(429);
    });

    it('starts the count over after a successful login', async () => {
      const { cashier } = await createBusiness(prisma, 'reinicio');
      for (let i = 0; i < 4; i++)
        await login(cashier.email, 'otra-clave').expect(401);
      await login(cashier.email, STAFF_PASSWORD).expect(200);
      for (let i = 0; i < 4; i++)
        await login(cashier.email, 'otra-clave').expect(401);
      await login(cashier.email, STAFF_PASSWORD).expect(200);
    });

    it('does not block other accounts', async () => {
      const blocked = await createBusiness(prisma, 'vecino-a');
      const neighbour = await createBusiness(prisma, 'vecino-b');
      for (let i = 0; i < 5; i++)
        await login(blocked.cashier.email, 'otra-clave').expect(401);

      await login(neighbour.cashier.email, STAFF_PASSWORD).expect(200);
    });

    it('caps a burst of parallel attempts at the limit', async () => {
      const { cashier } = await createBusiness(prisma, 'rafaga');
      const statuses = await Promise.all(
        Array.from(
          { length: 8 },
          async () => (await login(cashier.email, 'otra-clave')).status,
        ),
      );
      expect(statuses.filter((s) => s === 401)).toHaveLength(5);
      expect(statuses.filter((s) => s === 429)).toHaveLength(3);
    });
  });

  describe('POST /api/auth/password', () => {
    const changePassword = (token: string, body: object) =>
      request(app.getHttpServer())
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const accessToken = async () =>
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send(credentials())
          .expect(200)
      ).body.accessToken as string;

    it('needs a session', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/password')
        .send({ currentPassword: STAFF_PASSWORD, newPassword: 'nueva-2026' })
        .expect(401);
    });

    it('changes the password: the old one stops working', async () => {
      await changePassword(await accessToken(), {
        currentPassword: STAFF_PASSWORD,
        newPassword: 'nueva-clave-2026',
      }).expect(204);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ ...credentials(), password: 'nueva-clave-2026' })
        .expect(200);
    });

    it('asks for the current password', async () => {
      const res = await changePassword(await accessToken(), {
        currentPassword: 'no-es-esta',
        newPassword: 'nueva-clave-2026',
      }).expect(400);

      expect(res.body.message).toBe('Tu contraseña actual no es correcta');
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials())
        .expect(200);
    });

    it('asks for a new password of at least 8 characters', async () => {
      const res = await changePassword(await accessToken(), {
        currentPassword: STAFF_PASSWORD,
        newPassword: 'corta',
      }).expect(400);
      expect(res.body.message).toEqual([
        'La contraseña debe tener al menos 8 caracteres',
      ]);
    });

    it('shares the attempt limit with the login', async () => {
      const { cashier } = await createBusiness(prisma, 'cambio');
      const token = (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: cashier.email, password: STAFF_PASSWORD })
          .expect(200)
      ).body.accessToken as string;
      for (let i = 0; i < 5; i++)
        await changePassword(token, {
          currentPassword: 'no-es-esta',
          newPassword: 'nueva-clave-2026',
        }).expect(400);

      await changePassword(token, {
        currentPassword: STAFF_PASSWORD,
        newPassword: 'nueva-clave-2026',
      }).expect(429);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: cashier.email, password: STAFF_PASSWORD })
        .expect(429);
    });
  });
});
