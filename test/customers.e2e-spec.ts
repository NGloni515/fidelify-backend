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

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;
  let otro: Awaited<ReturnType<typeof createBusiness>>;
  let ownerToken: string;

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${ownerToken}`);
  const search = (body: object = {}) =>
    asOwner(request(app.getHttpServer()).post('/api/customers/search')).send(
      body,
    );
  const detail = (id: string) =>
    asOwner(request(app.getHttpServer()).get(`/api/customers/${id}`));
  const erase = (id: string) =>
    asOwner(request(app.getHttpServer()).delete(`/api/customers/${id}`));

  async function addCustomer(
    fixture: typeof less,
    name: string,
    phone: string,
    serialNumber: string,
  ) {
    const customer = await prisma.customer.create({
      data: {
        businessId: fixture.business.id,
        name,
        phone,
        consentAt: new Date(),
        consentText: 'Acepto',
      },
    });
    const pass = await prisma.pass.create({
      data: {
        programId: fixture.program.id,
        customerId: customer.id,
        serialNumber,
        authToken: `secret-token-${serialNumber}`,
      },
    });
    return { customer, pass };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    less = await createBusiness(prisma, 'less');
    otro = await createBusiness(prisma, 'otro');
    const owner = await createOwner(prisma, less);
    ownerToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: owner.email, password: STAFF_PASSWORD })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('who can use it', () => {
    it('needs a session', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/customers/search').expect(401);
      await request(server)
        .get(`/api/customers/${less.customer.id}`)
        .expect(401);
      await request(server)
        .delete(`/api/customers/${less.customer.id}`)
        .expect(401);
    });

    it('is closed to cashiers', async () => {
      const token = (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: less.cashier.email, password: STAFF_PASSWORD })
          .expect(200)
      ).body.accessToken;
      const server = app.getHttpServer();
      await request(server)
        .post('/api/customers/search')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(server)
        .get(`/api/customers/${less.customer.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(server)
        .delete(`/api/customers/${less.customer.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(await prisma.customer.count()).toBe(2);
    });
  });

  describe('POST /api/customers/search', () => {
    it('lists the customers of the business by name, with their card', async () => {
      await addCustomer(less, 'Ana Torres', '0990000001', 'FL-ANA');
      await prisma.transaction.createMany({
        data: [
          {
            passId: less.pass.id,
            type: 'STAMP',
            amount: 1,
            createdAt: new Date('2026-10-01T15:00:00Z'),
          },
          {
            passId: less.pass.id,
            type: 'REDEEM',
            amount: -1,
            createdAt: new Date('2026-10-05T15:00:00Z'),
          },
          {
            passId: less.pass.id,
            type: 'ADJUST',
            amount: 1,
            note: 'Corrección',
            createdAt: new Date('2026-10-09T15:00:00Z'),
          },
        ],
      });

      const res = await search().expect(200);

      expect(res.body).toEqual({
        total: 2,
        page: 1,
        pageSize: 50,
        customers: [
          {
            id: expect.any(String),
            name: 'Ana Torres',
            phone: '0990000001',
            joinedAt: expect.any(String),
            lastVisitAt: null,
            passes: [
              {
                serialNumber: 'FL-ANA',
                balance: 0,
                rewardsReady: 0,
                stampsRequired: 3,
              },
            ],
          },
          {
            id: less.customer.id,
            name: 'Cliente less',
            phone: '0991234567',
            joinedAt: expect.any(String),
            lastVisitAt: '2026-10-05T15:00:00.000Z',
            passes: [
              {
                serialNumber: 'FL-LESS',
                balance: 0,
                rewardsReady: 0,
                stampsRequired: 3,
              },
            ],
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toContain('secret-token');
    });

    it('finds by name in any casing, by phone digits and by card code', async () => {
      await addCustomer(less, 'Ana Torres', '0990000001', 'FL-ANA');
      const names = async (query: string) =>
        (await search({ query }).expect(200)).body.customers.map(
          (c: { name: string }) => c.name,
        );

      expect(await names('torres')).toEqual(['Ana Torres']);
      expect(await names('099 123')).toEqual(['Cliente less']);
      expect(await names('fl-ana')).toEqual(['Ana Torres']);
      expect(await names('nadie')).toEqual([]);
    });

    it('does not match phones on one or two digits', async () => {
      expect((await search({ query: '09' }).expect(200)).body.total).toBe(0);
    });

    it('pages by 50', async () => {
      await prisma.customer.createMany({
        data: Array.from({ length: 55 }, (_, i) => ({
          businessId: less.business.id,
          name: `Cliente ${String(i).padStart(2, '0')}`,
          phone: `09800000${String(i).padStart(2, '0')}`,
          consentAt: new Date(),
          consentText: 'Acepto',
        })),
      });

      const first = await search().expect(200);
      const second = await search({ page: 2 }).expect(200);

      expect(first.body.total).toBe(56);
      expect(first.body.customers).toHaveLength(50);
      expect(second.body.customers).toHaveLength(6);
      expect(second.body.page).toBe(2);
    });

    it('rejects a field the DTO does not declare', async () => {
      await search({ businessId: otro.business.id }).expect(400);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('shows the customer, the card and its movements, newest first', async () => {
      await prisma.customer.update({
        where: { id: less.customer.id },
        data: { email: 'cliente@less.test', birthDate: new Date('1990-03-07') },
      });
      await prisma.transaction.createMany({
        data: [
          {
            passId: less.pass.id,
            staffId: less.cashier.id,
            type: 'STAMP',
            amount: 2,
            createdAt: new Date('2026-10-01T15:00:00Z'),
          },
          {
            passId: less.pass.id,
            type: 'ADJUST',
            amount: -1,
            note: 'Sello de más',
            createdAt: new Date('2026-10-02T15:00:00Z'),
          },
        ],
      });

      const res = await detail(less.customer.id).expect(200);

      expect(res.body).toEqual({
        id: less.customer.id,
        name: 'Cliente less',
        phone: '0991234567',
        email: 'cliente@less.test',
        birthDate: '1990-03-07',
        joinedAt: expect.any(String),
        consentAt: expect.any(String),
        passes: [
          {
            serialNumber: 'FL-LESS',
            balance: 0,
            rewardsReady: 0,
            program: {
              name: 'Tarjeta de sellos',
              stampsRequired: 3,
              rewardText: '1 helado gratis',
            },
            movements: [
              {
                type: 'ADJUST',
                amount: -1,
                note: 'Sello de más',
                at: '2026-10-02T15:00:00.000Z',
                staffName: null,
              },
              {
                type: 'STAMP',
                amount: 2,
                note: null,
                at: '2026-10-01T15:00:00.000Z',
                staffName: 'Caja less',
              },
            ],
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toContain('secret-token');
      expect(res.body.consentText).toBeUndefined();
    });

    it('answers 404 for an id that does not exist', async () => {
      const res = await detail('no-existe').expect(404);
      expect(res.body.message).toBe('Cliente no encontrado');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('erases the customer and keeps the card voided, with its movements', async () => {
      await prisma.transaction.create({
        data: { passId: less.pass.id, type: 'STAMP', amount: 2 },
      });

      await erase(less.customer.id).expect(204);

      expect(
        await prisma.customer.findUnique({ where: { id: less.customer.id } }),
      ).toBeNull();
      const pass = await prisma.pass.findUniqueOrThrow({
        where: { id: less.pass.id },
        include: { transactions: true },
      });
      expect(pass).toMatchObject({ status: 'VOIDED', customerId: null });
      expect(pass.transactions).toHaveLength(1);
    });

    it('takes the customer out of the list, the detail and the cash desk', async () => {
      await erase(less.customer.id).expect(204);

      expect((await search().expect(200)).body.total).toBe(0);
      expect((await search({ query: '0991' }).expect(200)).body.total).toBe(0);
      await detail(less.customer.id).expect(404);
      const scan = await asOwner(
        request(app.getHttpServer()).get('/api/passes/FL-LESS'),
      ).expect(404);
      expect(scan.body.message).toBe('Tarjeta no encontrada');
    });

    it('keeps the stamps of the erased customer in the numbers of the business', async () => {
      await prisma.transaction.create({
        data: { passId: less.pass.id, type: 'STAMP', amount: 2 },
      });
      const dashboard = () =>
        asOwner(request(app.getHttpServer()).get('/api/dashboard')).expect(200);
      const before = (await dashboard()).body;

      await erase(less.customer.id).expect(204);

      const after = (await dashboard()).body;
      expect(before.customers.total).toBe(1);
      expect(after.customers.total).toBe(0);
      expect(after.today.stamps).toBe(2);
      expect(after.period.stamps).toBe(2);
      expect(after.topCustomers).toEqual([]);
      expect(after.lapsedCustomers).toEqual([]);
    });

    it('lets the same phone join again, with a new card', async () => {
      await erase(less.customer.id).expect(204);

      const res = await request(app.getHttpServer())
        .post('/api/public/businesses/less/join')
        .send({ name: 'Cliente less', phone: '0991234567', consent: true })
        .expect(201);

      expect(res.body.serialNumber).not.toBe('FL-LESS');
      expect(res.body.balance).toBe(0);
    });

    it('answers 404 for an id that does not exist, or the second time', async () => {
      await erase(less.customer.id).expect(204);

      const again = await erase(less.customer.id).expect(404);
      await erase('no-existe').expect(404);
      expect(again.body.message).toBe('Cliente no encontrado');
    });
  });

  describe('isolation between businesses', () => {
    it('never lists a customer of another business, not even by searching', async () => {
      await addCustomer(otro, 'Ana de otro', '0990000009', 'FL-ANA-OTRO');

      const all = await search().expect(200);
      const byName = await search({ query: 'Ana' }).expect(200);
      const byCode = await search({ query: 'FL-OTRO' }).expect(200);

      expect(all.body.total).toBe(1);
      expect(byName.body.total).toBe(0);
      expect(byCode.body.total).toBe(0);
    });

    it("answers 404 for another business's customer", async () => {
      const res = await detail(otro.customer.id).expect(404);
      expect(res.body.message).toBe('Cliente no encontrado');
    });

    it("never erases another business's customer", async () => {
      await erase(otro.customer.id).expect(404);

      expect(
        await prisma.customer.findUnique({ where: { id: otro.customer.id } }),
      ).not.toBeNull();
      const pass = await prisma.pass.findUniqueOrThrow({
        where: { id: otro.pass.id },
      });
      expect(pass).toMatchObject({
        status: 'ACTIVE',
        customerId: otro.customer.id,
      });
    });
  });
});
