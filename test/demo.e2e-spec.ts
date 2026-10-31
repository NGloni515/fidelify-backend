import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  DEMO_CASHIER_EMAIL,
  DEMO_OWNER_EMAIL,
  resetDemo,
} from '../prisma/demo-data.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { createBusiness, resetDatabase } from './helpers/fixtures.js';

const PASSWORD = 'demo-de-prueba-2026';

describe('Demo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const reset = () => resetDemo(prisma as unknown as PrismaClient, PASSWORD);
  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds a demo the owner and the cashier can log into', async () => {
    const { cards } = await reset();

    expect(cards.map((c) => c.serialNumber)).toEqual([
      'FL-DEMO-CAMILA',
      'FL-DEMO-LUIS',
      'FL-DEMO-MARIA',
      'FL-DEMO-ANDRES',
      'FL-DEMO-DANIELA',
      'FL-DEMO-JORGE',
      'FL-DEMO-PEDRO',
    ]);
    const owner = await login(DEMO_OWNER_EMAIL).expect(200);
    const cashier = await login(DEMO_CASHIER_EMAIL).expect(200);
    expect(owner.body.user.role).toBe('OWNER');
    expect(cashier.body.user.role).toBe('CASHIER');

    const card = await request(app.getHttpServer())
      .get('/api/passes/FL-DEMO-ANDRES')
      .set('Authorization', `Bearer ${cashier.body.accessToken}`)
      .expect(200);
    expect(card.body).toMatchObject({ balance: 1, rewardsReady: 1 });
  });

  it("gives the owner's home someone who stopped coming", async () => {
    await reset();
    const owner = await login(DEMO_OWNER_EMAIL).expect(200);

    const home = await request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${owner.body.accessToken}`)
      .expect(200);

    expect(home.body.lapsedCustomers).toEqual([
      expect.objectContaining({ name: 'Pedro Cevallos' }),
    ]);
    expect(home.body.topCustomers).toHaveLength(5);
  });

  it('keeps every balance consistent with its movements', async () => {
    await reset();

    const passes = await prisma.pass.findMany({
      include: { transactions: true, program: true },
    });
    expect(passes).toHaveLength(7);
    for (const pass of passes) {
      const stamps = pass.transactions
        .filter((t) => t.type === 'STAMP' || t.type === 'ADJUST')
        .reduce((sum, t) => sum + t.amount, 0);
      const redeemed = pass.transactions.filter(
        (t) => t.type === 'REDEEM',
      ).length;
      const required = pass.program.stampsRequired;
      expect(pass.balance).toBe(stamps % required);
      expect(pass.rewardsReady).toBe(Math.floor(stamps / required) - redeemed);
    }
  });

  it('starts over on every run, dropping what was added since', async () => {
    await reset();
    await request(app.getHttpServer())
      .post('/api/public/businesses/demo/join')
      .send({ name: 'Visita', phone: '0991112222', consent: true })
      .expect(201);

    await reset();

    expect(await prisma.business.count({ where: { slug: 'demo' } })).toBe(1);
    expect(await prisma.customer.count()).toBe(7);
    expect(await prisma.staffUser.count()).toBe(2);
  });

  it('leaves every other business alone', async () => {
    const other = await createBusiness(prisma, 'less');

    await reset();
    await reset();

    const pass = await prisma.pass.findUniqueOrThrow({
      where: { id: other.pass.id },
    });
    expect(pass.serialNumber).toBe('FL-LESS');
    expect(
      await prisma.staffUser.count({
        where: { businessId: other.business.id },
      }),
    ).toBe(1);
  });
});
