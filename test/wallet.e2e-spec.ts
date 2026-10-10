import { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ApnsClient } from '../src/wallet/apple/apns-client.js';
import {
  createBusiness,
  resetDatabase,
  STAFF_PASSWORD,
} from './helpers/fixtures.js';
import { WALLET_ENV } from './test-env.js';

const ISSUER_ID = '3388000000000000001';
const PASS_TYPE_ID = 'pass.test.fidelify.loyalty';

const binary = (
  res: request.Response,
  callback: (e: null, b: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Wallet (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let less: Awaited<ReturnType<typeof createBusiness>>;
  let workdir: string;
  let googlePublicKey: string;
  let token: string;
  const fetchMock = vi.fn();
  const apns = {
    statusFor: {} as Record<string, number>,
    pushes: [] as { topic: string; pushTokens: string[] }[],
    async push(_credentials: unknown, topic: string, pushTokens: string[]) {
      this.pushes.push({ topic, pushTokens });
      return pushTokens.map((pushToken) => ({
        pushToken,
        status: this.statusFor[pushToken] ?? 200,
      }));
    },
  };

  const server = () => app.getHttpServer();
  const applePass = `ApplePass secret-token-less`;
  const registration = `/api/wallet/apple/v1/devices/device-1/registrations/${PASS_TYPE_ID}/FL-LESS`;
  const register = (pushToken = 'push-token-1') =>
    request(server())
      .post(registration)
      .set('Authorization', applePass)
      .send({ pushToken });
  const stamp = (count = 1) =>
    request(server())
      .post('/api/passes/FL-LESS/stamp')
      .set('Authorization', `Bearer ${token}`)
      .send({ count });
  const googleCalls = () =>
    fetchMock.mock.calls
      .map(([url, init]) => ({
        url: String(url),
        method: init?.method as string,
        body: init?.body,
      }))
      .filter(({ url }) => url.includes('walletobjects.googleapis.com'));
  const readPass = (pkpass: Buffer, entry: string) => {
    const file = join(workdir, 'downloaded.pkpass');
    writeFileSync(file, pkpass);
    return execFileSync('unzip', ['-p', file, entry]);
  };

  beforeAll(async () => {
    workdir = mkdtempSync(join(tmpdir(), 'fidelify-wallet-'));

    const google = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    googlePublicKey = google.publicKey;
    process.env.GOOGLE_WALLET_ISSUER_ID = ISSUER_ID;
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT = JSON.stringify({
      client_email: 'fidelify@test.iam.gserviceaccount.com',
      private_key: google.privateKey,
    });

    // A self-signed certificate stands in for Apple's: it exercises the real
    // signing path, though a phone would reject the result.
    const cert = join(workdir, 'cert.pem');
    const key = join(workdir, 'key.pem');
    execFileSync(
      'openssl',
      // prettier-ignore
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=Pass Type ID: test/OU=TEAM123456/O=Fidelify Test'],
      { stdio: 'ignore' },
    );
    process.env.APPLE_PASS_TYPE_ID = PASS_TYPE_ID;
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_PASS_CERT = cert;
    process.env.APPLE_PASS_KEY = key;
    process.env.APPLE_WWDR_CERT = cert;
    process.env.PUBLIC_API_URL = 'https://api.fidelify.test';

    // Imported here, not at the top: the config module reads the environment
    // when the app module loads, so the credentials above must already be set.
    const { createTestApp } = await import('./helpers/app.js');
    app = await createTestApp((builder) =>
      builder.overrideProvider(ApnsClient).useValue(apns),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    less = await createBusiness(prisma, 'less');
    await prisma.business.update({
      where: { id: less.business.id },
      data: {
        colors: {
          background: '#591223',
          foreground: '#EDE7AB',
          label: '#91CBFB',
        },
      },
    });
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: less.cashier.email, password: STAFF_PASSWORD })
      .expect(200);
    token = login.body.accessToken;

    apns.pushes = [];
    apns.statusFor = {};
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('oauth2.googleapis.com')
        ? Response.json({ access_token: 'google-token', expires_in: 3600 })
        : Response.json({}),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
    for (const key of WALLET_ENV) process.env[key] = '';
    rmSync(workdir, { recursive: true, force: true });
  });

  describe('Google Wallet', () => {
    it('redirects to a save link signed by the service account', async () => {
      const res = await request(server())
        .get('/api/wallet/google/FL-LESS')
        .expect(302);

      const location = res.headers.location as string;
      expect(location.startsWith('https://pay.google.com/gp/v/save/')).toBe(
        true,
      );
      const [header, payload, signature] = location
        .split('/')
        .pop()!
        .split('.');
      const verified = createVerify('RSA-SHA256')
        .update(`${header}.${payload}`)
        .verify(googlePublicKey, signature, 'base64url');
      expect(verified).toBe(true);

      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      expect(claims).toMatchObject({
        iss: 'fidelify@test.iam.gserviceaccount.com',
        aud: 'google',
        typ: 'savetowallet',
      });
      const [object] = claims.payload.genericObjects;
      expect(object).toMatchObject({
        id: `${ISSUER_ID}.fidelify_pass_${less.pass.id}`,
        classId: `${ISSUER_ID}.fidelify_program_${less.program.id}`,
        state: 'ACTIVE',
        hexBackgroundColor: '#591223',
        barcode: { type: 'QR_CODE', value: 'FL-LESS' },
      });
      expect(object.cardTitle.defaultValue.value).toBe('Negocio less');
      expect(object.header.defaultValue.value).toBe('Cliente less');
      expect(object.textModulesData[0]).toEqual({
        id: 'stamps',
        header: 'Sellos',
        body: '0 de 3',
      });
      expect(claims.payload.genericClasses[0].id).toBe(object.classId);
      expect(JSON.stringify(claims)).not.toContain('secret-token');
      expect(JSON.stringify(claims)).not.toContain('0991234567');
    });

    it('answers 404 for a card that does not exist', async () => {
      await request(server()).get('/api/wallet/google/FL-NADIE').expect(404);
    });

    it('updates the saved card after a stamp', async () => {
      await stamp().expect(201);

      const [patch, ...rest] = googleCalls();
      expect(rest).toEqual([]);
      expect(patch.method).toBe('PATCH');
      expect(patch.url).toBe(
        `https://walletobjects.googleapis.com/walletobjects/v1/genericobject/${ISSUER_ID}.fidelify_pass_${less.pass.id}`,
      );
      expect(JSON.parse(patch.body).textModulesData[0].body).toBe('1 de 3');
    });

    it('notifies the customer when the card is completed', async () => {
      await stamp(3).expect(201);

      const [, message] = googleCalls();
      expect(message.method).toBe('POST');
      expect(message.url.endsWith('/addMessage')).toBe(true);
      expect(JSON.parse(message.body).message).toMatchObject({
        header: 'Negocio less',
        body: '¡Completaste tu tarjeta! Te espera 1 helado gratis.',
        messageType: 'TEXT_AND_NOTIFY',
      });
    });

    it('skips the message when the customer never saved the card', async () => {
      fetchMock.mockImplementation(async (url: string) =>
        String(url).includes('oauth2.googleapis.com')
          ? Response.json({ access_token: 'google-token', expires_in: 3600 })
          : new Response(null, { status: 404 }),
      );

      await stamp(3).expect(201);

      expect(googleCalls().map(({ method }) => method)).toEqual(['PATCH']);
    });

    it('still gives the stamp when Google is down', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const res = await stamp().expect(201);

      expect(res.body.balance).toBe(1);
    });
  });

  describe('Apple Wallet', () => {
    it('serves a signed card with the brand of the business', async () => {
      const res = await request(server())
        .get('/api/wallet/apple/FL-LESS')
        .buffer(true)
        .parse(binary)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/vnd.apple.pkpass');
      const pass = JSON.parse(readPass(res.body, 'pass.json').toString());
      expect(pass).toMatchObject({
        passTypeIdentifier: PASS_TYPE_ID,
        teamIdentifier: 'TEAM123456',
        serialNumber: 'FL-LESS',
        organizationName: 'Negocio less',
        backgroundColor: 'rgb(89, 18, 35)',
        foregroundColor: 'rgb(237, 231, 171)',
        labelColor: 'rgb(145, 203, 251)',
        webServiceURL: 'https://api.fidelify.test/api/wallet/apple/',
        authenticationToken: 'secret-token-less',
      });
      expect(pass.storeCard.headerFields[0]).toMatchObject({
        key: 'stamps',
        value: '0 de 3',
      });
      expect(pass.barcodes[0]).toMatchObject({
        message: 'FL-LESS',
        format: 'PKBarcodeFormatQR',
      });
      expect(JSON.stringify(pass)).not.toContain('0991234567');
      expect(readPass(res.body, 'manifest.json').length).toBeGreaterThan(0);
      expect(readPass(res.body, 'signature').length).toBeGreaterThan(0);
      expect(readPass(res.body, 'icon.png').length).toBeGreaterThan(0);
    });

    it('registers a device only with the token of that card', async () => {
      await request(server())
        .post(registration)
        .send({ pushToken: 'push-token-1' })
        .expect(401);
      await request(server())
        .post(registration)
        .set('Authorization', 'ApplePass secret-token-otro')
        .send({ pushToken: 'push-token-1' })
        .expect(401);

      await register().expect(201);
      await register('push-token-2').expect(200);

      const registrations = await prisma.appleDeviceRegistration.findMany();
      expect(registrations).toHaveLength(1);
      expect(registrations[0]).toMatchObject({
        deviceLibraryId: 'device-1',
        pushToken: 'push-token-2',
        passId: less.pass.id,
      });
      const pass = await prisma.pass.findUniqueOrThrow({
        where: { id: less.pass.id },
      });
      expect(pass.platform).toBe('APPLE');
    });

    it('rejects a pass type that is not ours', async () => {
      await request(server())
        .post(registration.replace(PASS_TYPE_ID, 'pass.com.otro'))
        .set('Authorization', applePass)
        .send({ pushToken: 'push-token-1' })
        .expect(404);
    });

    it('tells a device which cards changed since its last visit', async () => {
      const list = `/api/wallet/apple/v1/devices/device-1/registrations/${PASS_TYPE_ID}`;
      await request(server()).get(list).expect(204);

      await register().expect(201);
      const first = await request(server()).get(list).expect(200);
      expect(first.body.serialNumbers).toEqual(['FL-LESS']);

      await request(server())
        .get(list)
        .query({ passesUpdatedSince: first.body.lastUpdated })
        .expect(204);

      await stamp().expect(201);
      const afterStamp = await request(server())
        .get(list)
        .query({ passesUpdatedSince: first.body.lastUpdated })
        .expect(200);
      expect(afterStamp.body.serialNumbers).toEqual(['FL-LESS']);
    });

    it('serves the latest card to a registered device, or 304 if unchanged', async () => {
      const latest = `/api/wallet/apple/v1/passes/${PASS_TYPE_ID}/FL-LESS`;
      await request(server()).get(latest).expect(401);

      await stamp(2).expect(201);
      const res = await request(server())
        .get(latest)
        .set('Authorization', applePass)
        .buffer(true)
        .parse(binary)
        .expect(200);
      const pass = JSON.parse(readPass(res.body, 'pass.json').toString());
      expect(pass.storeCard.headerFields[0].value).toBe('2 de 3');

      await request(server())
        .get(latest)
        .set('Authorization', applePass)
        .set('If-Modified-Since', res.headers['last-modified'])
        .expect(304);
    });

    it('pushes to every registered device after a stamp', async () => {
      await register().expect(201);

      await stamp().expect(201);

      expect(apns.pushes).toEqual([
        { topic: PASS_TYPE_ID, pushTokens: ['push-token-1'] },
      ]);
    });

    it('forgets a device Apple reports as gone', async () => {
      await register().expect(201);
      apns.statusFor['push-token-1'] = 410;

      await stamp().expect(201);

      expect(await prisma.appleDeviceRegistration.count()).toBe(0);
    });

    it('unregisters a device', async () => {
      await register().expect(201);
      await request(server()).delete(registration).expect(401);

      await request(server())
        .delete(registration)
        .set('Authorization', applePass)
        .expect(200);

      expect(await prisma.appleDeviceRegistration.count()).toBe(0);
    });

    it('accepts the logs Apple Wallet reports', async () => {
      await request(server())
        .post('/api/wallet/apple/v1/log')
        .send({ logs: ['algo falló en el dispositivo'] })
        .expect(200);
    });
  });
});
