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

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;
  let otro: Awaited<ReturnType<typeof createBusiness>>;
  let ownerToken: string;

  const summary = () =>
    request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);

  async function addCustomer(
    fixture: typeof less,
    name: string,
    joinedDaysAgo: number,
    visitsDaysAgo: number[] = [],
  ) {
    const customer = await prisma.customer.create({
      data: {
        businessId: fixture.business.id,
        name,
        phone: `0990${String(Math.random()).slice(2, 8)}`,
        consentAt: daysAgo(joinedDaysAgo),
        consentText: 'Acepto',
        createdAt: daysAgo(joinedDaysAgo),
      },
    });
    const pass = await prisma.pass.create({
      data: {
        programId: fixture.program.id,
        customerId: customer.id,
        serialNumber: `FL-${name.toUpperCase()}`,
        authToken: `secret-token-${name}`,
        createdAt: daysAgo(joinedDaysAgo),
      },
    });
    await prisma.transaction.createMany({
      data: visitsDaysAgo.map((days) => ({
        passId: pass.id,
        type: 'STAMP' as const,
        amount: 1,
        createdAt: daysAgo(days),
      })),
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

  it('needs a session and is closed to cashiers', async () => {
    await request(app.getHttpServer()).get('/api/dashboard').expect(401);
    const token = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: less.cashier.email, password: STAFF_PASSWORD })
        .expect(200)
    ).body.accessToken;
    await request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('starts at zero for a business with one new customer', async () => {
    const res = await summary().expect(200);

    expect(res.body).toEqual({
      periodDays: 30,
      customers: { total: 1, newInPeriod: 1, lapsed: 0 },
      today: { stamps: 0, rewardsRedeemed: 0 },
      period: { stamps: 0, rewardsRedeemed: 0 },
      rewardsPending: 0,
      topCustomers: [],
      lapsedCustomers: [],
    });
  });

  it('sums the business, ranks who comes most and lists who stopped coming', async () => {
    await prisma.transaction.createMany({
      data: [
        { passId: less.pass.id, type: 'STAMP', amount: 2 },
        { passId: less.pass.id, type: 'REDEEM', amount: -1 },
        { passId: less.pass.id, type: 'ADJUST', amount: 1, note: 'Corrección' },
        {
          passId: less.pass.id,
          type: 'STAMP',
          amount: 1,
          createdAt: daysAgo(10),
        },
      ],
    });
    await prisma.pass.update({
      where: { id: less.pass.id },
      data: { rewardsReady: 1 },
    });
    const luis = await addCustomer(less, 'luis', 50, [5]);
    await prisma.pass.update({
      where: { id: luis.pass.id },
      data: { rewardsReady: 2 },
    });
    const ana = await addCustomer(less, 'ana', 60, [40]);
    const pedro = await addCustomer(less, 'pedro', 45);
    await addCustomer(less, 'nueva', 2);
    await addCustomer(otro, 'ajeno', 90, [0, 1, 2]);
    await prisma.pass.update({
      where: { id: otro.pass.id },
      data: { rewardsReady: 5 },
    });

    const res = await summary().expect(200);

    expect(res.body).toMatchObject({
      customers: { total: 5, newInPeriod: 2, lapsed: 2 },
      today: { stamps: 2, rewardsRedeemed: 1 },
      period: { stamps: 4, rewardsRedeemed: 1 },
      rewardsPending: 3,
    });
    expect(res.body.topCustomers).toEqual([
      {
        id: less.customer.id,
        name: 'Cliente less',
        visits: 2,
        lastVisitAt: expect.any(String),
      },
      {
        id: luis.customer.id,
        name: 'luis',
        visits: 1,
        lastVisitAt: expect.any(String),
      },
    ]);
    expect(res.body.lapsedCustomers).toEqual([
      {
        id: ana.customer.id,
        name: 'ana',
        joinedAt: expect.any(String),
        lastVisitAt: expect.any(String),
      },
      {
        id: pedro.customer.id,
        name: 'pedro',
        joinedAt: expect.any(String),
        lastVisitAt: null,
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('ajeno');
    expect(JSON.stringify(res.body)).not.toContain('"phone"');
  });

  it('ignores the visits made with a voided card', async () => {
    const { pass } = await addCustomer(less, 'anulada', 60, [3]);
    await prisma.pass.update({
      where: { id: pass.id },
      data: { status: 'VOIDED' },
    });

    const res = await summary().expect(200);

    expect(res.body.customers.lapsed).toBe(1);
    expect(res.body.lapsedCustomers[0]).toMatchObject({
      name: 'anulada',
      lastVisitAt: null,
    });
  });
});
