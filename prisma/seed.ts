import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const business = await prisma.business.upsert({
  where: { slug: 'heladeria-demo' },
  update: {},
  create: {
    name: 'Heladería Demo',
    slug: 'heladeria-demo',
    colors: { background: '#C2185B', foreground: '#FFFFFF', label: '#FCE4EC' },
    branches: { create: { name: 'Local principal' } },
    programs: {
      create: {
        name: 'Tarjeta de sellos',
        stampsRequired: 8,
        rewardText: '1 helado gratis',
      },
    },
  },
  include: { branches: { take: 1 } },
});
console.log(`Negocio listo: ${business.name} → /join/${business.slug}`);

const password = process.env.SEED_STAFF_PASSWORD;
const staff = [
  { email: process.env.SEED_OWNER_EMAIL, name: 'Dueña Demo', role: 'OWNER' },
  { email: process.env.SEED_CASHIER_EMAIL, name: 'Caja Demo', role: 'CASHIER' },
] as const;

if (password) {
  const passwordHash = await hashPassword(password);
  for (const { email, name, role } of staff) {
    if (!email) continue;
    await prisma.staffUser.upsert({
      where: { email: email.toLowerCase() },
      update: { passwordHash, active: true },
      create: {
        businessId: business.id,
        branchId: business.branches[0]?.id,
        email: email.toLowerCase(),
        name,
        role,
        passwordHash,
      },
    });
    console.log(`Equipo listo: ${email} (${role})`);
  }
} else {
  console.log('Sin SEED_STAFF_PASSWORD: no se creó equipo.');
}

await prisma.$disconnect();
