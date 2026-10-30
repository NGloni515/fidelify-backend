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
  });
});
