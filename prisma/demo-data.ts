import { hashPassword } from '../src/auth/password.js';
import { newAuthToken } from '../src/common/serial.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { CONSENT_TEXT } from '../src/public/public.service.js';

export const DEMO_SLUG = 'demo';
export const DEMO_OWNER_EMAIL = 'demo@fidelifyec.com';
export const DEMO_CASHIER_EMAIL = 'demo-caja@fidelifyec.com';

const STAMPS_REQUIRED = 5;
const DAY = 24 * 60 * 60 * 1000;

// Fixed codes so a demo script can say "search FL-DEMO-CAMILA" after any reset.
const CUSTOMERS = [
  {
    code: 'CAMILA',
    name: 'Camila Torres',
    phone: '0990000101',
    stamps: 3,
    redeemed: 0,
    joinedDaysAgo: 40,
  },
  {
    code: 'LUIS',
    name: 'Luis Andrade',
    phone: '0990000102',
    stamps: 4,
    redeemed: 0,
    joinedDaysAgo: 35,
  },
  {
    code: 'MARIA',
    name: 'María José Vera',
    phone: '0990000103',
    stamps: 5,
    redeemed: 0,
    joinedDaysAgo: 30,
  },
  {
    code: 'ANDRES',
    name: 'Andrés Salazar',
    phone: '0990000104',
    stamps: 11,
    redeemed: 1,
    joinedDaysAgo: 25,
  },
  {
    code: 'DANIELA',
    name: 'Daniela Ruiz',
    phone: '0990000105',
    stamps: 1,
    redeemed: 0,
    joinedDaysAgo: 20,
  },
  {
    code: 'JORGE',
    name: 'Jorge Molina',
    phone: '0990000106',
    stamps: 7,
    redeemed: 1,
    joinedDaysAgo: 15,
  },
];

export interface DemoCard {
  serialNumber: string;
  customerName: string;
  balance: number;
  rewardsReady: number;
}

// Deletes the demo business with everything under it and builds it again, in
// one transaction: a failure leaves the previous demo untouched.
export async function resetDemo(
  prisma: PrismaClient,
  password: string,
  now = new Date(),
): Promise<{ stampsRequired: number; cards: DemoCard[] }> {
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(
    async (db) => {
      // Movements first: see "Borrar un negocio" in agent/coding-standards.md.
      await db.transaction.deleteMany({
        where: { pass: { program: { business: { slug: DEMO_SLUG } } } },
      });
      await db.business.deleteMany({ where: { slug: DEMO_SLUG } });

      const business = await db.business.create({
        data: {
          name: 'Heladería Demo',
          slug: DEMO_SLUG,
          colors: {
            background: '#C2185B',
            foreground: '#FFFFFF',
            label: '#FCE4EC',
          },
          branches: { create: { name: 'Local principal' } },
          programs: {
            create: {
              name: 'Tarjeta de sellos',
              stampsRequired: STAMPS_REQUIRED,
              rewardText: '1 helado gratis',
            },
          },
        },
        include: { branches: true, programs: true },
      });
      const branch = business.branches[0];
      const program = business.programs[0];

      const [owner] = await Promise.all([
        db.staffUser.create({
          data: {
            businessId: business.id,
            branchId: branch.id,
            name: 'Dueña Demo',
            email: DEMO_OWNER_EMAIL,
            role: 'OWNER',
            passwordHash,
          },
        }),
        db.staffUser.create({
          data: {
            businessId: business.id,
            branchId: branch.id,
            name: 'Caja Demo',
            email: DEMO_CASHIER_EMAIL,
            role: 'CASHIER',
            passwordHash,
          },
        }),
      ]);

      const cards: DemoCard[] = [];
      for (const c of CUSTOMERS) {
        const joinedAt = new Date(now.getTime() - c.joinedDaysAgo * DAY);
        const earned = Math.floor(c.stamps / STAMPS_REQUIRED);
        const balance = c.stamps % STAMPS_REQUIRED;
        const rewardsReady = earned - c.redeemed;

        const customer = await db.customer.create({
          data: {
            businessId: business.id,
            name: c.name,
            phone: c.phone,
            consentAt: joinedAt,
            consentText: CONSENT_TEXT,
            createdAt: joinedAt,
          },
        });
        const pass = await db.pass.create({
          data: {
            programId: program.id,
            customerId: customer.id,
            serialNumber: `FL-DEMO-${c.code}`,
            authToken: newAuthToken(),
            balance,
            rewardsReady,
            createdAt: joinedAt,
          },
        });

        // Visits spread evenly between joining and today, redemptions last.
        const visits = c.stamps + c.redeemed;
        const at = (n: number) =>
          new Date(
            joinedAt.getTime() +
              ((n + 1) * (now.getTime() - joinedAt.getTime())) / (visits + 1),
          );
        await db.transaction.createMany({
          data: [
            ...Array.from({ length: c.stamps }, (_, n) => ({
              type: 'STAMP' as const,
              amount: 1,
              createdAt: at(n),
            })),
            ...Array.from({ length: c.redeemed }, (_, n) => ({
              type: 'REDEEM' as const,
              amount: -1,
              createdAt: at(c.stamps + n),
            })),
          ].map((movement) => ({
            ...movement,
            passId: pass.id,
            staffId: owner.id,
            branchId: branch.id,
          })),
        });

        cards.push({
          serialNumber: pass.serialNumber,
          customerName: c.name,
          balance,
          rewardsReady,
        });
      }
      return { stampsRequired: STAMPS_REQUIRED, cards };
    },
    { timeout: 30_000 },
  );
}
