import { HttpException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import {
  createBusiness,
  createOwner,
  resetDatabase,
  STAFF_PASSWORD,
} from './helpers/fixtures.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;
  let otro: Awaited<ReturnType<typeof createBusiness>>;
  let ownerToken: string;

  const server = () => app.getHttpServer();
  const login = async (email: string) =>
    (
      await request(server())
        .post('/api/auth/login')
        .send({ email, password: STAFF_PASSWORD })
        .expect(200)
    ).body.accessToken as string;
  const overview = (token = ownerToken) =>
    request(server())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
  const send = (body: object, token = ownerToken) =>
    request(server())
      .post('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const lastMessage = async (passId: string) =>
    (await prisma.pass.findUniqueOrThrow({ where: { id: passId } }))
      .lastMessage;

  async function addCustomer(
    fixture: typeof less,
    name: string,
    { joinedDaysAgo = 0, balance = 0, visitsDaysAgo = [] as number[] } = {},
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
        serialNumber: `FL-${fixture.business.slug}-${name}`.toUpperCase(),
        authToken: `secret-token-${name}`,
        balance,
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
    ownerToken = await login((await createOwner(prisma, less)).email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a session and is closed to cashiers', async () => {
    await request(server()).get('/api/notifications').expect(401);
    await request(server())
      .post('/api/notifications')
      .send({ message: 'Hola', audience: 'ALL' })
      .expect(401);

    const cashierToken = await login(less.cashier.email);
    await overview(cashierToken).expect(403);
    await send({ message: 'Hola', audience: 'ALL' }, cashierToken).expect(403);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('counts who is in each group before anything is sent', async () => {
    // The fixture customer joined today with no stamps: only in ALL.
    await addCustomer(less, 'ana', { joinedDaysAgo: 40 });
    await addCustomer(less, 'bruno', { joinedDaysAgo: 10, balance: 2 });
    await addCustomer(less, 'carla', {
      joinedDaysAgo: 40,
      balance: 2,
      visitsDaysAgo: [5],
    });
    await prisma.pass.create({
      data: {
        programId: less.program.id,
        serialNumber: 'FL-ANULADA',
        authToken: 'secret-token-anulada',
        status: 'VOIDED',
        balance: 2,
      },
    });
    await addCustomer(otro, 'ajena', { joinedDaysAgo: 40, balance: 2 });

    const res = await overview().expect(200);

    expect(res.body).toEqual({
      maxLength: 120,
      limits: { perDay: 1, perWeek: 2 },
      nextAvailableAt: null,
      audiences: [
        { audience: 'ALL', size: 4 },
        { audience: 'LAPSED', size: 1 },
        { audience: 'ONE_STAMP_LEFT', size: 2 },
      ],
      history: [],
    });
  });

  it('writes the message on the cards of the group, and on no other', async () => {
    const ana = await addCustomer(less, 'ana', { joinedDaysAgo: 40 });
    const bruno = await addCustomer(less, 'bruno', { balance: 2 });
    const ajena = await addCustomer(otro, 'ajena', { balance: 2 });

    const res = await send({
      message: '  Te falta un sello: ven por tu helado  ',
      audience: 'ONE_STAMP_LEFT',
    }).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      message: 'Te falta un sello: ven por tu helado',
      audience: 'ONE_STAMP_LEFT',
      audienceSize: 1,
      // No wallet is configured in this spec: the cards are in no phone.
      reached: 0,
      sentAt: expect.any(String),
    });
    expect(await lastMessage(bruno.pass.id)).toBe(
      'Te falta un sello: ven por tu helado',
    );
    expect(await lastMessage(ana.pass.id)).toBeNull();
    expect(await lastMessage(less.pass.id)).toBeNull();
    expect(await lastMessage(ajena.pass.id)).toBeNull();

    const after = await overview().expect(200);
    expect(after.body.history).toEqual([res.body]);
    expect(Date.parse(after.body.nextAvailableAt)).toBe(
      Date.parse(res.body.sentAt) + DAY,
    );
  });

  it('holds the next message for a day, and a third one for a week', async () => {
    await send({ message: 'Hoy 2x1 en conos', audience: 'ALL' }).expect(201);

    const held = await send({
      message: 'Mañana también',
      audience: 'ALL',
    }).expect(429);
    expect(held.body.message).toBe(
      'Ya llegaste al límite de mensajes. Puedes enviar el próximo en 24 horas.',
    );

    await prisma.notification.updateMany({
      data: { createdAt: new Date(Date.now() - 25 * HOUR) },
    });
    await send({ message: 'Mañana también', audience: 'ALL' }).expect(201);

    // The first one turns a week old in 143 hours: 6 days, rounded up.
    const third = await send({ message: 'Y hoy', audience: 'ALL' }).expect(429);
    expect(third.body.message).toBe(
      'Ya llegaste al límite de mensajes. Puedes enviar el próximo en 6 días.',
    );
    expect(await prisma.notification.count()).toBe(2);
  });

  it('lets only one of two messages sent at the same time go', async () => {
    // Straight to the service: over HTTP the second request arrives after the
    // first one is saved, and the two never overlap.
    const owner = await prisma.staffUser.findFirstOrThrow({
      where: { businessId: less.business.id, role: 'OWNER' },
    });
    const staff = {
      ...owner,
      business: { id: less.business.id, name: 'Less', slug: 'less' },
    };
    const service = app.get(NotificationsService);

    const results = await Promise.allSettled([
      service.send(staff, { message: 'Uno', audience: 'ALL' }),
      service.send(staff, { message: 'Dos', audience: 'ALL' }),
    ]);

    const statuses = results.map((result) =>
      result.status === 'fulfilled'
        ? 201
        : (result.reason as HttpException).getStatus(),
    );
    expect(statuses.sort()).toEqual([201, 429]);
    expect(await prisma.notification.count()).toBe(1);
  });

  it('refuses a group with nobody in it, without spending the limit', async () => {
    const res = await send({ message: 'Te extrañamos', audience: 'LAPSED' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No hay clientes en ese grupo.');
    await send({ message: 'Hoy 2x1 en conos', audience: 'ALL' }).expect(201);
  });

  it('checks the message and the group', async () => {
    const cases: [object, string][] = [
      [{ message: '   ', audience: 'ALL' }, 'Escribe el mensaje'],
      [
        { message: 'x'.repeat(121), audience: 'ALL' },
        'El mensaje no puede pasar de 120 caracteres',
      ],
      [
        { message: 'Hola', audience: 'TODOS' },
        'Elige a quién le llega el mensaje',
      ],
      [
        { message: 'Hola', audience: 'ALL', businessId: otro.business.id },
        'property businessId should not exist',
      ],
    ];
    for (const [body, error] of cases) {
      const res = await send(body).expect(400);
      expect(res.body.message).toContain(error);
    }
    await send({ message: 'x'.repeat(120), audience: 'ALL' }).expect(201);
  });

  it('keeps each business to its own messages and its own limit', async () => {
    await send({ message: 'Hoy 2x1 en conos', audience: 'ALL' }).expect(201);
    const otroToken = await login((await createOwner(prisma, otro)).email);

    const res = await send(
      { message: 'Promo del otro negocio', audience: 'ALL' },
      otroToken,
    ).expect(201);

    expect(res.body.audienceSize).toBe(1);
    expect(await lastMessage(otro.pass.id)).toBe('Promo del otro negocio');
    expect(await lastMessage(less.pass.id)).toBe('Hoy 2x1 en conos');
    const mine = await overview().expect(200);
    expect(
      mine.body.history.map((n: { message: string }) => n.message),
    ).toEqual(['Hoy 2x1 en conos']);
  });
});
