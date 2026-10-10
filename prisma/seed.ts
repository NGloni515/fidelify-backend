// Datos de ejemplo para desarrollo: una heladería con su programa de sellos.
// Ejecutar con: npm run db:seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
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
});

console.log(`Negocio listo: ${business.name} → /join/${business.slug}`);
await prisma.$disconnect();
