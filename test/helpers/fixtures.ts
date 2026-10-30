import { hashPassword } from '../../src/auth/password.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export const STAFF_PASSWORD = 'clave-de-prueba-2026';
// Hashed once: scrypt is slow on purpose and every test creates staff.
const staffPasswordHash = hashPassword(STAFF_PASSWORD);

export async function resetDatabase(prisma: PrismaService) {
  const [{ name }] = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to truncate "${name}"`);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business" CASCADE');
}

export async function createBusiness(prisma: PrismaService, slug: string) {
  const business = await prisma.business.create({
    data: {
      name: `Negocio ${slug}`,
      slug,
      branches: { create: { name: 'Local principal' } },
      programs: {
        create: {
          name: 'Tarjeta de sellos',
          stampsRequired: 3,
          rewardText: '1 helado gratis',
        },
      },
    },
    include: { branches: true, programs: true },
  });
  const branch = business.branches[0];
  const program = business.programs[0];

  const cashier = await prisma.staffUser.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      name: `Caja ${slug}`,
      email: `caja@${slug}.test`,
      role: 'CASHIER',
      passwordHash: await staffPasswordHash,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: `Cliente ${slug}`,
      phone: '0991234567',
      consentAt: new Date(),
      consentText: 'Acepto',
    },
  });
  const pass = await prisma.pass.create({
    data: {
      programId: program.id,
      customerId: customer.id,
      serialNumber: `FL-${slug.toUpperCase()}`,
      authToken: `secret-token-${slug}`,
    },
  });

  return { business, branch, program, cashier, customer, pass };
}

export async function createOwner(
  prisma: PrismaService,
  fixture: Awaited<ReturnType<typeof createBusiness>>,
) {
  const slug = fixture.business.slug;
  return prisma.staffUser.create({
    data: {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      name: `Dueño ${slug}`,
      email: `dueno@${slug}.test`,
      role: 'OWNER',
      passwordHash: await staffPasswordHash,
    },
  });
}
