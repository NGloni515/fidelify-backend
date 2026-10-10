import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { createBusiness, resetDatabase } from './helpers/fixtures.js';

describe('Wallet sin credenciales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createBusiness(prisma, 'less');
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 501 in Spanish instead of failing', async () => {
    const apple = await request(app.getHttpServer())
      .get('/api/wallet/apple/FL-LESS')
      .expect(501);
    const google = await request(app.getHttpServer())
      .get('/api/wallet/google/FL-LESS')
      .expect(501);
    expect(apple.body.message).toBe('Apple Wallet todavía no está configurado');
    expect(google.body.message).toBe(
      'Google Wallet todavía no está configurado',
    );
  });
});
