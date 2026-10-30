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

- **Wallet nunca se probó con credenciales reales.** El código está completo y
  cubierto con llaves de prueba, pero ninguna tarjeta se ha instalado en un
  teléfono. Ver `agent/features/modulo_wallet.md`.

## Design system

El backend no tiene UI, pero produce lo que más ve el cliente final: su tarjeta
en la billetera (`src/wallet/`). Y los mensajes de error de esta API se muestran tal cual en
pantalla. Antes de tocar cualquiera de las dos cosas, leer
[`design-system.md`](design-system.md). La fuente de verdad general está en la
carpeta que agrupa los repos (`../design-system.md`).

## Archivos de contexto

- @agent/project-overview.md
- @agent/coding-standards.md
- @agent/ai-interaction.md

Detalle por módulo en `agent/features/`:
`modulo_auth.md`, `modulo_equipo.md`, `modulo_inscripcion.md`,
`modulo_sellos.md`, `modulo_wallet.md`.

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
npm run staff:reset-password -- --email …       # contraseña temporal, para soporte
DEMO_PASSWORD=… npm run demo:reset               # borra y rehace la demo
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
- **`importFileExtension = "js"` en `schema.prisma` no es decorativo.** Sin esa
  línea, el cliente generado decide la extensión de sus imports mirando si hay
  un `tsconfig.json` al lado. En la imagen Docker todavía no lo hay cuando corre
  `prisma generate`, el cliente sale importando archivos `.ts`, y la app
  compila bien y muere al arrancar con `ERR_MODULE_NOT_FOUND`.
- **Los e2e ignoran las credenciales de Wallet del `.env`** a propósito, y usan
  llaves que generan ellos mismos. Tener Wallet configurado en local no cambia
  ningún test.

## Arquitectura

| Pieza | Qué |
|---|---|
| Framework | NestJS 12 sobre Express |
| Datos | Prisma 7 + `@prisma/adapter-pg`, PostgreSQL |
| Validación | `class-validator` + `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Config | `@nestjs/config`, validada al arrancar en `src/config/env.validation.ts` |
| Sesión | JWT con `@nestjs/jwt`. Refresh en cookie `HttpOnly`, con las cookies nativas de Nest 12 (sin `cookie-parser`) |
| Wallet | Apple: `passkit-generator` + push a APNs por HTTP/2. Google: JWT firmado + REST con `fetch`. Sin SDK de Google |
| Tests | Vitest; Supertest para e2e |
| Lint / formato | oxlint / Prettier |

```
prisma/schema.prisma   modelo de datos
prisma/migrations/     migraciones; se commitean
prisma/seed.ts         negocio de ejemplo con su equipo, para desarrollo
prisma/create-business.ts  alta de un negocio real con su dueño
prisma/reset-password.ts   contraseña temporal para un usuario que olvidó la suya
prisma/demo-data.ts    la demo completa: negocio, equipo, clientes y tarjetas
prisma/demo.ts         CLI de la demo (npm run demo:reset)
src/app.setup.ts       prefijo /api, ValidationPipe y CORS
src/auth/              login del equipo, sesión, límite de intentos y guards
src/staff/             equipo: el dueño administra a sus cajeras
src/public/            inscripción desde la página pública
src/passes/            sellos y canjes (caja)
src/wallet/            tarjeta en Apple Wallet y Google Wallet, y su actualización
secrets/               certificados y llaves de Wallet en local; ignorado por git
src/prisma/            PrismaService, módulo global
src/config/            validación de variables de entorno
src/common/            generación de serial y token
```

## Variables de entorno

| Variable | Para |
|---|---|
| `DATABASE_URL` | conexión a PostgreSQL. **Obligatoria**, también al instalar |
| `DIRECT_URL` | conexión directa a la base, sin pooler. Solo la usa la CLI de Prisma. Opcional: sin ella usa `DATABASE_URL` |
| `DB_PORT` | puerto del Postgres de Docker en la máquina. Solo lo lee `docker-compose.yml` |
| `PORT` | puerto (3000 por defecto) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | firma de los tokens. **Obligatorias**, mínimo 32 caracteres, distintas entre sí |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` | duración de cada token (900 y 2592000 por defecto) |
| `NODE_ENV` | con `production` la cookie de sesión sale `Secure` |
| `SEED_OWNER_EMAIL`, `SEED_CASHIER_EMAIL`, `SEED_STAFF_PASSWORD` | equipo que crea el seed. Solo desarrollo |
| `PUBLIC_API_URL` | URL pública `https://` de esta API. Sin ella las tarjetas de Apple no se actualizan |
| `GOOGLE_WALLET_*`, `APPLE_*` | credenciales de Wallet, todas opcionales. Ver `agent/features/modulo_wallet.md` |
| `DEMO_PASSWORD` | contraseña de los dos usuarios demo. Solo la lee `npm run demo:reset` |
| `CORS_ORIGINS` | orígenes permitidos, separados por coma. Por defecto `5173` (panel) y `5174` (página pública) |
| `PUBLIC_WEB_URL` | URL de la página pública. Declarada y validada, todavía sin uso |

Ver `.env.example`. Una variable nueva se declara también en
`src/config/env.validation.ts`: así la app se niega a arrancar si falta, en vez
de fallar en la primera petición que la use.

## Despliegue

Corre en **Railway** (proyecto `fidelify`, servicio `fidelify-backend`), desde
el `Dockerfile` de la raíz, contra una base **Neon**. Hoy en
`https://fidelify-backend-production.up.railway.app`.

- Al arrancar, el contenedor corre `prisma migrate deploy` y después la app. Si
  una migración falla, el contenedor no levanta.
- `railway.json` fija el builder y el healthcheck en `/api/health`: Railway no
  da por bueno un despliegue hasta que esa ruta responde.
- **Dos URLs de base.** `DATABASE_URL` es la del *pooler* de Neon y la usa la
  app. `DIRECT_URL` es la conexión directa y la usa solo la CLI de Prisma
  (`prisma.config.ts`): las migraciones no funcionan bien a través del pooler.
- La imagen **no lleva `src/`**: `npm run business:create`,
  `staff:reset-password` y el seed no corren dentro del contenedor. El alta de un negocio se hace desde una máquina de
  desarrollo, con `DATABASE_URL` apuntando a la base de producción.
- Los secretos de Wallet van en **base64**
  (`base64 -i secrets/apple/pass.pem | pbcopy`), nunca como archivo.
- El panel le habla a esta API a través de su propio proxy, sin CORS. La página
  pública sí la llama directo: su origen tiene que estar en `CORS_ORIGINS`.

Variables que el servicio necesita en Railway: `DATABASE_URL`, `DIRECT_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `PUBLIC_API_URL` y las
de Wallet. `NODE_ENV=production` ya lo fija la imagen; `PORT` lo pone Railway.

Antes de subir un cambio al `Dockerfile` se construye y se arranca en local:

```bash
docker build -t fidelify-backend:local .
docker run --rm -p 3100:3000 --env-file <archivo-con-variables> fidelify-backend:local
```

## La demo

Un negocio de muestra que vive en producción para enseñar el producto:
**Heladería Demo** (`slug` `demo`), con dueña (`demo@fidelifyec.com`), cajera
(`demo-caja@fidelifyec.com`) y seis clientes con historial, cuyas tarjetas
tienen códigos fijos (`FL-DEMO-CAMILA`, `FL-DEMO-LUIS`…).

- **Se arma en código**, en `prisma/demo-data.ts`. Cuando una funcionalidad
  nueva necesite datos para lucirse en la demo, se agregan ahí.
- **Reiniciarla borra todo lo que cuelga del negocio y lo vuelve a crear**,
  incluidas las tarjetas que alguien haya sacado por `/join/demo`: esas dejan de
  actualizarse en el celular. Los demás negocios no se tocan (cubierto en
  `test/demo.e2e-spec.ts`).
- **El `slug` `demo` está reservado.** Ningún negocio real puede usarlo.
- Quien tenga la contraseña de la demo puede cambiarla en Mi cuenta o
  desactivar a la cajera, y dejar afuera a los demás. Reiniciarla lo arregla.
- En producción se reinicia desde GitHub: pestaña **Actions → Reiniciar demo →
  Run workflow** (`.github/workflows/demo-reset.yml`). Usa los secretos del
  repo `DEMO_DATABASE_URL` (la conexión directa de Neon) y `DEMO_PASSWORD`. Se
  corre después de que Railway termine de desplegar, para que el esquema ya
  esté migrado.

## Orden de despliegue

**Este repo va primero, siempre.** El `ValidationPipe` rechaza con 400
(`"property X should not exist"`) cualquier campo que el DTO no declare: un
cliente que manda un campo nuevo antes de que el DTO esté desplegado deja de
funcionar. Backend (con `prisma migrate deploy`) → web y backoffice.

## Convención de PRs

- Rama nueva desde **`origin/main`**: `feat/<algo>` o `fix/<algo>`.
- Cuerpo con **¿Qué?** y **¿Por qué?** (+ Verificación).
