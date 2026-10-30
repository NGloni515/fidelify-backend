import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const { values } = parseArgs({ options: { email: { type: 'string' } } });
const email = values.email?.trim().toLowerCase();
if (!email) {
  console.error(
    '\nFalta --email\n\nUso: npm run staff:reset-password -- --email dueno@negocio.com\n',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  const staff = await prisma.staffUser.findUnique({
    where: { email },
    select: { id: true, name: true, active: true, business: true },
  });
  if (!staff) {
    console.error(`\nNo existe un usuario con el correo ${email}\n`);
    process.exit(1);
  }

  const temporaryPassword = randomBytes(12).toString('base64url');
  await prisma.staffUser.update({
    where: { id: staff.id },
    data: { passwordHash: await hashPassword(temporaryPassword) },
  });

  console.log(`\nContraseña cambiada: ${staff.name} (${staff.business.name})`);
  if (!staff.active)
    console.log('  Ojo: la cuenta está desactivada y no va a poder entrar.');
  console.log(
    `  Contraseña temporal (no se vuelve a mostrar): ${temporaryPassword}`,
  );
  console.log('  Que la cambie en Mi cuenta apenas entre.\n');
} finally {
  await prisma.$disconnect();
}
