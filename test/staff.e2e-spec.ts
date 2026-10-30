import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import {
  createBusiness,
  createOwner,
  resetDatabase,
  STAFF_PASSWORD,
} from './helpers/fixtures.js';

describe('Staff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;
  let otro: Awaited<ReturnType<typeof createBusiness>>;
  let owner: Awaited<ReturnType<typeof createOwner>>;
  let ownerToken: string;

  const login = (email: string, password = STAFF_PASSWORD) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${ownerToken}`);
  const patch = (id: string, body: object) =>
    asOwner(request(app.getHttpServer()).patch(`/api/staff/${id}`)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    less = await createBusiness(prisma, 'less');
    otro = await createBusiness(prisma, 'otro');
    owner = await createOwner(prisma, less);
    ownerToken = (await login(owner.email).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('who can use it', () => {
    it('needs a session', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/staff').expect(401);
      await request(server).post('/api/staff').expect(401);
      await request(server).patch(`/api/staff/${less.cashier.id}`).expect(401);
    });

    it('is closed to cashiers', async () => {
      const token = (await login(less.cashier.email).expect(200)).body
        .accessToken;
      const server = app.getHttpServer();
      const res = await request(server)
        .get('/api/staff')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body.message).toBe(
        'Solo el dueño del negocio puede hacer esto',
      );
      await request(server)
        .post('/api/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Otra',
          email: 'otra@less.test',
          password: 'clave-larga',
        })
        .expect(403);
      await request(server)
        .patch(`/api/staff/${less.cashier.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ active: false })
        .expect(403);
    });
  });

  describe('GET /api/staff', () => {
    it('lists the team of the business, owner first, without secrets', async () => {
      const res = await asOwner(
        request(app.getHttpServer()).get('/api/staff'),
      ).expect(200);

      expect(res.body).toEqual([
        {
          id: owner.id,
          name: 'Dueño less',
          email: 'dueno@less.test',
          role: 'OWNER',
          active: true,
          createdAt: expect.any(String),
        },
        {
          id: less.cashier.id,
          name: 'Caja less',
          email: 'caja@less.test',
          role: 'CASHIER',
          active: true,
          createdAt: expect.any(String),
        },
      ]);
    });
  });

  describe('POST /api/staff', () => {
    const create = (body: object) =>
      asOwner(request(app.getHttpServer()).post('/api/staff')).send(body);

    it('adds a cashier who can log in right away', async () => {
      const res = await create({
        name: '  Ana Pérez ',
        email: 'Ana@Less.test',
        password: 'heladito-2026',
      }).expect(201);

      expect(res.body).toMatchObject({
        name: 'Ana Pérez',
        email: 'ana@less.test',
        role: 'CASHIER',
        active: true,
      });
      const session = await login('ana@less.test', 'heladito-2026').expect(200);
      expect(session.body.user).toMatchObject({
        role: 'CASHIER',
        branchId: less.branch.id,
        business: { id: less.business.id },
      });
    });

    it('does not take the role from the body', async () => {
      await create({
        name: 'Ana',
        email: 'ana@less.test',
        password: 'heladito-2026',
        role: 'OWNER',
      }).expect(400);
    });

    it('rejects an email already in use, in this business or another', async () => {
      for (const email of ['caja@less.test', 'CAJA@otro.test']) {
        const res = await create({
          name: 'Ana',
          email,
          password: 'heladito-2026',
        }).expect(409);
        expect(res.body.message).toBe('Ya existe un usuario con ese correo');
      }
    });

    it('asks for a password of at least 8 characters', async () => {
      const res = await create({
        name: 'Ana',
        email: 'ana@less.test',
        password: 'corta',
      }).expect(400);
      expect(res.body.message).toEqual([
        'La contraseña debe tener al menos 8 caracteres',
      ]);
    });
  });

  describe('PATCH /api/staff/:id', () => {
    it('deactivating a cashier ends her session and her logins', async () => {
      const cashierToken = (await login(less.cashier.email).expect(200)).body
        .accessToken;

      const res = await patch(less.cashier.id, { active: false }).expect(200);

      expect(res.body.active).toBe(false);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(401);
      await login(less.cashier.email).expect(401);
    });

    it('reactivating gives her access back', async () => {
      await patch(less.cashier.id, { active: false }).expect(200);
      await patch(less.cashier.id, { active: true }).expect(200);
      await login(less.cashier.email).expect(200);
    });

    it('sets a new password for a cashier who forgot hers', async () => {
      await patch(less.cashier.id, { password: 'nueva-clave-2026' }).expect(
        200,
      );
      await login(less.cashier.email).expect(401);
      await login(less.cashier.email, 'nueva-clave-2026').expect(200);
    });

    it('does not touch an owner, starting with the one asking', async () => {
      const res = await patch(owner.id, { active: false }).expect(403);
      expect(res.body.message).toBe(
        'Desde Equipo solo se cambian las cuentas de las cajeras',
      );
      await login(owner.email).expect(200);
    });

    it('asks for something to change', async () => {
      const res = await patch(less.cashier.id, {}).expect(400);
      expect(res.body.message).toBe('No hay nada que cambiar');
    });

    it('answers 404 for an id that does not exist', async () => {
      await patch('no-existe', { active: false }).expect(404);
    });
  });

  describe('isolation between businesses', () => {
    it('lists nobody from another business', async () => {
      const res = await asOwner(
        request(app.getHttpServer()).get('/api/staff'),
      ).expect(200);
      expect(res.body.map((s: { email: string }) => s.email)).not.toContain(
        otro.cashier.email,
      );
    });

    it("answers 404 for another business's cashier and leaves her as she was", async () => {
      const res = await patch(otro.cashier.id, {
        active: false,
        password: 'robada-2026',
      }).expect(404);

      expect(res.body.message).toBe('Usuario no encontrado');
      await login(otro.cashier.email).expect(200);
    });

    it('adds the new cashier to the business of the session', async () => {
      await asOwner(request(app.getHttpServer()).post('/api/staff'))
        .send({
          name: 'Ana',
          email: 'ana@less.test',
          password: 'heladito-2026',
        })
        .expect(201);

      const ana = await prisma.staffUser.findUniqueOrThrow({
        where: { email: 'ana@less.test' },
      });
      expect(ana.businessId).toBe(less.business.id);
      expect(
        await prisma.staffUser.count({
          where: { businessId: otro.business.id },
        }),
      ).toBe(1);
    });
  });
});
