import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  DEMO_CASHIER_EMAIL,
  DEMO_OWNER_EMAIL,
  DEMO_SLUG,
  resetDemo,
} from './demo-data.js';

const password = process.env.DEMO_PASSWORD;
if (!password) {
  console.error('\nFalta DEMO_PASSWORD: la contraseña de los usuarios demo.\n');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  const { stampsRequired, cards } = await resetDemo(prisma, password);
  console.log(`\nDemo reiniciada: /join/${DEMO_SLUG}`);
  console.log(`  Dueña:  ${DEMO_OWNER_EMAIL}`);
  console.log(`  Caja:   ${DEMO_CASHIER_EMAIL}`);
  for (const card of cards)
    console.log(
      `  ${card.serialNumber.padEnd(16)} ${card.customerName.padEnd(16)} ${card.balance} de ${stampsRequired} sellos, ${card.rewardsReady} premio(s)`,
    );
  console.log();
} finally {
  await prisma.$disconnect();
}
