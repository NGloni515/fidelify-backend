import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    slug: { type: 'string' },
    stamps: { type: 'string' },
    reward: { type: 'string' },
    'owner-name': { type: 'string' },
    'owner-email': { type: 'string' },
    branch: { type: 'string', default: 'Local principal' },
    background: { type: 'string' },
    foreground: { type: 'string' },
    label: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`\n${message}\n`);
  console.error(
    'Uso: npm run business:create -- --name "Less Yogurt & Coffee" --slug less \\\n' +
      '  --stamps 8 --reward "1 helado gratis" \\\n' +
      '  --owner-name "Nombre" --owner-email dueno@negocio.com \\\n' +
      '  [--branch "Local principal"] [--background #591223 --foreground #EDE7AB --label #91CBFB]',
  );
  process.exit(1);
}

function required(key: keyof typeof values): string {
  const value = values[key]?.trim();
  if (!value) fail(`Falta --${key}`);
  return value;
}

const name = required('name');
const slug = required('slug');
const rewardText = required('reward');
const ownerName = required('owner-name');
const ownerEmail = required('owner-email').toLowerCase();
const stampsRequired = Number(required('stamps'));

if (!SLUG.test(slug))
  fail('--slug solo admite minúsculas, números y guiones (ej. "less")');
if (!Number.isInteger(stampsRequired) || stampsRequired < 1)
  fail('--stamps debe ser un entero mayor o igual a 1');
if (!EMAIL.test(ownerEmail)) fail('--owner-email no parece un correo');

const colorKeys = ['background', 'foreground', 'label'] as const;
const givenColors = colorKeys.filter((key) => values[key]);
if (givenColors.length > 0 && givenColors.length < colorKeys.length)
  fail('Los colores van los tres juntos: --background, --foreground y --label');
for (const key of givenColors)
  if (!HEX_COLOR.test(values[key]!)) fail(`--${key} debe ser un hex #RRGGBB`);
const colors =
  givenColors.length === colorKeys.length
    ? {
        background: values.background!,
        foreground: values.foreground!,
        label: values.label!,
      }
    : undefined;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  if (await prisma.business.findUnique({ where: { slug } }))
    fail(`Ya existe un negocio con el slug "${slug}"`);
  if (await prisma.staffUser.findUnique({ where: { email: ownerEmail } }))
    fail(`Ya existe un usuario con el correo ${ownerEmail}`);

  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);

  const business = await prisma.$transaction(async (db) => {
    const created = await db.business.create({
      data: {
        name,
        slug,
        colors,
        branches: { create: { name: values.branch! } },
        programs: {
          create: { name: 'Tarjeta de sellos', stampsRequired, rewardText },
        },
      },
      include: { branches: true },
    });
    await db.staffUser.create({
      data: {
        businessId: created.id,
        branchId: created.branches[0].id,
        name: ownerName,
        email: ownerEmail,
        role: 'OWNER',
        passwordHash,
      },
    });
    return created;
  });

  console.log(`\nNegocio creado: ${business.name}`);
  console.log(`  Inscripción:  /join/${business.slug}`);
  console.log(`  Tarjeta:      ${stampsRequired} sellos → ${rewardText}`);
  console.log(`  Dueño:        ${ownerEmail}`);
  console.log(
    `  Contraseña temporal (no se vuelve a mostrar): ${temporaryPassword}\n`,
  );
} finally {
  await prisma.$disconnect();
}
