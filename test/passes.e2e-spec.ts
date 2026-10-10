import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import {
  createBusiness,
  resetDatabase,
  STAFF_PASSWORD,
} from './helpers/fixtures.js';

describe('Passes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;
  let otro: Awaited<ReturnType<typeof createBusiness>>;
  let token: string;

  const as = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const stamp = (serial: string, body?: object) =>
    as(request(app.getHttpServer()).post(`/api/passes/${serial}/stamp`)).send(
      body,
    );
  const redeem = (serial: string) =>
    as(request(app.getHttpServer()).post(`/api/passes/${serial}/redeem`));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    less = await createBusiness(prisma, 'less');
    otro = await createBusiness(prisma, 'otro');
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: less.cashier.email, password: STAFF_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects every route without a session', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/passes/FL-LESS').expect(401);
    await request(server).post('/api/passes/FL-LESS/stamp').expect(401);
    await request(server).post('/api/passes/FL-LESS/redeem').expect(401);
  });

  it('returns only what the cashier screen needs', async () => {
    const res = await as(
      request(app.getHttpServer()).get('/api/passes/FL-LESS'),
    ).expect(200);

    expect(res.body).toEqual({
      serialNumber: 'FL-LESS',
      balance: 0,
      rewardsReady: 0,
      customer: { name: 'Cliente less', phone: '0991234567' },
      program: {
        name: 'Tarjeta de sellos',
        stampsRequired: 3,
        rewardText: '1 helado gratis',
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-token');
  });

  it("treats another business's card as not found and leaves it untouched", async () => {
    const server = app.getHttpServer();
    const found = await as(request(server).get('/api/passes/FL-OTRO')).expect(
      404,
    );
    await stamp('FL-OTRO', { count: 1 }).expect(404);
    await redeem('FL-OTRO').expect(404);

    expect(found.body.message).toBe('Tarjeta no encontrada');
    const untouched = await prisma.pass.findUniqueOrThrow({
      where: { id: otro.pass.id },
    });
    expect(untouched.balance).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('gives one stamp when the body is empty and records who gave it', async () => {
    const res = await stamp('FL-LESS').expect(201);

    expect(res.body).toEqual({
      serialNumber: 'FL-LESS',
      balance: 1,
      stampsRequired: 3,
      rewardsReady: 0,
      rewardEarned: false,
    });
    const movements = await prisma.transaction.findMany();
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      passId: less.pass.id,
      type: 'STAMP',
      amount: 1,
      staffId: less.cashier.id,
      branchId: less.branch.id,
    });
  });

  it('completes the card, redeems the reward once and refuses the second time', async () => {
    await stamp('FL-LESS', { count: 2 }).expect(201);
    const completed = await stamp('FL-LESS', { count: 1 }).expect(201);
    expect(completed.body).toMatchObject({
      balance: 0,
      rewardsReady: 1,
      rewardEarned: true,
    });

    const redeemed = await redeem('FL-LESS').expect(201);
    expect(redeemed.body).toEqual({
      serialNumber: 'FL-LESS',
      balance: 0,
      stampsRequired: 3,
      rewardsReady: 0,
    });

    const again = await redeem('FL-LESS').expect(400);
    expect(again.body.message).toBe('No hay premios disponibles para canjear');
    expect(await prisma.transaction.count({ where: { type: 'REDEEM' } })).toBe(
      1,
    );
  });

  it('rejects more than 20 stamps at once, in Spanish', async () => {
    const res = await stamp('FL-LESS', { count: 21 }).expect(400);
    expect(res.body.message).toEqual([
      'No puedes dar más de 20 sellos a la vez',
    ]);
  });

  it('treats a voided card as not found', async () => {
    await prisma.pass.update({
      where: { id: less.pass.id },
      data: { status: 'VOIDED' },
    });
    await as(request(app.getHttpServer()).get('/api/passes/FL-LESS')).expect(
      404,
    );
    await stamp('FL-LESS', { count: 1 }).expect(404);
  });

  it('does not lose a stamp when two cashiers scan at the same time', async () => {
    const results = await Promise.all([
      stamp('FL-LESS', { count: 1 }),
      stamp('FL-LESS', { count: 1 }),
    ]);

    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const pass = await prisma.pass.findUniqueOrThrow({
      where: { id: less.pass.id },
    });
    expect(pass.balance).toBe(2);
    expect(await prisma.transaction.count()).toBe(2);
  });
});
