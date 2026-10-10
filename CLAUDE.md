# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repo.

## Qué es esto

**API de Fidelify**: tarjetas de sellos y cupones que viven en Apple Wallet y
Google Wallet. NestJS 12 · Prisma 7 · PostgreSQL.

Es **multi-negocio**: cada heladería o cafetería es un `Business` y todo lo
demás cuelga de él.

**Este servicio es dueño de la lógica de negocio.** La página pública y el panel
capturan y muestran; cada cálculo y cada regla que decide si algo se puede
guardar vive aquí. Se expone el resultado, no los ingredientes: un cliente que
tiene que combinar componentes termina combinándolos distinto. Ver
`agent/coding-standards.md`.

## Antes de producción

Lo que hoy impide desplegar esto de cara a un negocio real:

- **`/api/wallet/*` responde 501.** Ver `agent/features/modulo_wallet.md`.
- **El login no limita los intentos.** Ver `agent/features/modulo_auth.md`.

## Design system

El backend no tiene UI, pero produce lo que más ve el cliente final: su tarjeta
en la billetera. Y los mensajes de error de esta API se muestran tal cual en
pantalla. Antes de tocar cualquiera de las dos cosas, leer
[`design-system.md`](design-system.md). La fuente de verdad general está en la
carpeta que agrupa los repos (`../design-system.md`).

## Archivos de contexto

- @agent/project-overview.md
- @agent/coding-standards.md
- @agent/ai-interaction.md

Detalle por módulo en `agent/features/`:
`modulo_auth.md`, `modulo_inscripcion.md`, `modulo_sellos.md`,
`modulo_wallet.md`.

## Comandos

```bash
npm run start:dev      # servidor en watch (:3000, prefijo /api)
npm run build          # nest build → dist/
npm run start:prod     # corre lo compilado

npm run lint           # oxlint src/ test/
npm run format         # prettier

npm test               # unit (Vitest)
npm run test:watch
npm run test:e2e       # e2e (Vitest + Supertest, contra Postgres)

npm run db:up          # Postgres 17 en Docker
npm run db:migrate     # prisma migrate dev
npm run db:seed        # crea "Heladería Demo" con una dueña y una cajera
npm run db:studio

npm run business:create -- --name … --slug …   # da de alta un negocio real
```

Un solo archivo de test: `npx vitest run src/passes/stamp-rules.spec.ts`

## Verificación

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

`npm run build` compila con `tsc`: sí chequea tipos.

## Cosas que confunden en un clon nuevo

- **`.env` antes de `npm install`.** El `postinstall` corre `prisma generate`,
  que lee `prisma.config.ts`, que exige `DATABASE_URL`. Sin `.env` la
  instalación falla con `Cannot resolve environment variable: DATABASE_URL`.
  Aplica igual en CI y en el build de cualquier plataforma de deploy.
- **Node 24.** Con Node 22.22.1 / npm 10, `npm ci` falla con `Missing:
  typescript@5.9.3 from lock file`. El lockfile está bien — con npm 11 instala
  limpio. No se regenera el lock para "arreglarlo".
- **Es un proyecto ESM** (`"type": "module"`, `nodenext`): todo import relativo
  lleva la extensión `.js`, aunque el archivo sea `.ts`.
- **El cliente de Prisma se genera dentro de `src/`**, en `src/generated/prisma`
  (ignorado por git). Se importa de `../generated/prisma/client.js`, no de
  `@prisma/client`.
- **La URL de la base no está en `schema.prisma`.** La app se conecta con el
  adaptador `@prisma/adapter-pg` en `src/prisma/prisma.service.ts`, y la CLI de
  Prisma la toma de `prisma.config.ts`.
- **El e2e necesita Postgres arriba** (`npm run db:up`). Crea por su cuenta la
  base `fidelify_test` al lado de la de desarrollo, le aplica las migraciones y
  **trunca todas las tablas antes de cada test**. Se niega a correr contra una
  base cuyo nombre no termine en `_test`.
- **Si el puerto 5432 está ocupado** por el Postgres de otro proyecto, se cambia
  `DB_PORT` y el puerto de `DATABASE_URL` en `.env`. No se toca
  `docker-compose.yml`.
- El prefijo `/api`, el `ValidationPipe` y el CORS se configuran en
  `src/app.setup.ts`, que usan tanto `main.ts` como los tests.

## Arquitectura

| Pieza | Qué |
|---|---|
| Framework | NestJS 12 sobre Express |
| Datos | Prisma 7 + `@prisma/adapter-pg`, PostgreSQL |
| Validación | `class-validator` + `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Config | `@nestjs/config`, validada al arrancar en `src/config/env.validation.ts` |
| Sesión | JWT con `@nestjs/jwt`. Refresh en cookie `HttpOnly`, con las cookies nativas de Nest 12 (sin `cookie-parser`) |
| Tests | Vitest; Supertest para e2e |
| Lint / formato | oxlint / Prettier |

```
prisma/schema.prisma   modelo de datos
prisma/migrations/     migraciones; se commitean
prisma/seed.ts         negocio de ejemplo con su equipo, para desarrollo
prisma/create-business.ts  alta de un negocio real con su dueño
src/app.setup.ts       prefijo /api, ValidationPipe y CORS
src/auth/              login del equipo, sesión y guard
src/public/            inscripción desde la página pública
src/passes/            sellos y canjes (caja)
src/wallet/            Apple / Google Wallet — sin implementar
src/prisma/            PrismaService, módulo global
src/config/            validación de variables de entorno
src/common/            generación de serial y token
```

## Variables de entorno

| Variable | Para |
|---|---|
| `DATABASE_URL` | conexión a PostgreSQL. **Obligatoria**, también al instalar |
| `DB_PORT` | puerto del Postgres de Docker en la máquina. Solo lo lee `docker-compose.yml` |
| `PORT` | puerto (3000 por defecto) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | firma de los tokens. **Obligatorias**, mínimo 32 caracteres, distintas entre sí |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` | duración de cada token (900 y 2592000 por defecto) |
| `NODE_ENV` | con `production` la cookie de sesión sale `Secure` |
| `SEED_OWNER_EMAIL`, `SEED_CASHIER_EMAIL`, `SEED_STAFF_PASSWORD` | equipo que crea el seed. Solo desarrollo |
| `CORS_ORIGINS` | orígenes permitidos, separados por coma. Por defecto `5173` (panel) y `5174` (página pública) |
| `PUBLIC_WEB_URL` | URL de la página pública. Declarada y validada, todavía sin uso |

Ver `.env.example`. Una variable nueva se declara también en
`src/config/env.validation.ts`: así la app se niega a arrancar si falta, en vez
de fallar en la primera petición que la use.

## Orden de despliegue

**Este repo va primero, siempre.** El `ValidationPipe` rechaza con 400
(`"property X should not exist"`) cualquier campo que el DTO no declare: un
cliente que manda un campo nuevo antes de que el DTO esté desplegado deja de
funcionar. Backend (con `prisma migrate deploy`) → web y backoffice.

## Convención de PRs

- Rama nueva desde **`origin/main`**: `feat/<algo>` o `fix/<algo>`.
- Cuerpo con **¿Qué?** y **¿Por qué?** (+ Verificación).
