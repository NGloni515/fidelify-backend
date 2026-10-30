# fidelify-backend

API de **Fidelify**: tarjetas de sellos y cupones que viven en Apple Wallet y Google Wallet.

Stack: NestJS 12 · TypeScript · PostgreSQL · Prisma 7.

## Requisitos

- Node.js 22.22.3+ (recomendado 24, ver `.nvmrc`)
- Docker (para la base de datos local)

## Arranque local

```bash
cp .env.example .env
npm install          # también genera el cliente de Prisma
npm run db:up        # levanta Postgres en Docker
npm run db:migrate   # aplica las migraciones
npm run db:seed      # crea "Heladería Demo" con su programa, una dueña y una cajera
npm run start:dev    # http://localhost:3000/api/health
```

El seed crea el equipo con los correos y la contraseña de `.env`
(`SEED_OWNER_EMAIL`, `SEED_CASHIER_EMAIL`, `SEED_STAFF_PASSWORD`).

Si el puerto 5432 ya lo usa otro Postgres, cambia `DB_PORT` y el puerto de
`DATABASE_URL` en `.env`.

## Despliegue

Railway construye el `Dockerfile` de la raíz. Al arrancar aplica las migraciones
pendientes y levanta la API. Variables y detalles en [`CLAUDE.md`](CLAUDE.md),
sección *Despliegue*.

## Wallet

Sin credenciales, los enlaces de Wallet responden 501 y todo lo demás funciona.
Para activarlas, deja los archivos en `secrets/` (ignorado por git) y descomenta
las variables de Wallet en `.env`. Detalle en
[`agent/features/modulo_wallet.md`](agent/features/modulo_wallet.md).

## Alta de un negocio

```bash
npm run business:create -- --name "Less Yogurt & Coffee" --slug less \
  --stamps 8 --reward "1 helado gratis" \
  --owner-name "Nombre" --owner-email dueno@negocio.com \
  --background '#591223' --foreground '#EDE7AB' --label '#91CBFB'
```

Crea el negocio, su local, su tarjeta de sellos y su dueño, e imprime una
contraseña temporal **una sola vez**. El `slug` queda impreso en el QR del
mostrador: no se cambia después. Corre contra la base de `DATABASE_URL`.

## Demo

`npm run demo:reset` borra y vuelve a crear la demo (Heladería Demo, `/join/demo`) con su equipo, clientes y tarjetas de ejemplo; la contraseña de los usuarios demo va en `DEMO_PASSWORD`. En producción se corre desde **Actions → Reiniciar demo**. Detalle en [`CLAUDE.md`](CLAUDE.md), sección *La demo*.

## Endpoints actuales

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/health` | Estado del servicio |
| POST | `/api/auth/login` | Inicia sesión del equipo |
| POST | `/api/auth/refresh` | Renueva la sesión con la cookie |
| POST | `/api/auth/logout` | Cierra la sesión |
| GET | `/api/auth/me` | Usuario con sesión |
| GET | `/api/public/businesses/:slug` | Datos del negocio y su programa (web pública) |
| POST | `/api/public/businesses/:slug/join` | Inscribe al cliente y crea su pase |
| GET | `/api/passes/:serial` | Consulta un pase (caja, con sesión) |
| POST | `/api/passes/:serial/stamp` | Suma sellos `{ "count": 1 }` (caja, con sesión) |
| POST | `/api/passes/:serial/redeem` | Canjea un premio (caja, con sesión) |
| GET | `/api/wallet/apple/:serial` | Tarjeta para Apple Wallet (`.pkpass`) |
| GET | `/api/wallet/google/:serial` | Redirige al enlace de guardado de Google Wallet |
| — | `/api/wallet/apple/v1/…` | Web service que llama Apple Wallet para actualizar tarjetas |

## Estructura

```
prisma/schema.prisma   Modelo de datos (negocios, clientes, pases, movimientos, cupones…)
src/auth/              Login del equipo, sesión y guard
src/public/            Inscripción desde la web pública
src/passes/            Sellos y canjes (stamp-rules.ts tiene la lógica pura + tests)
src/wallet/            Apple / Google Wallet: tarjeta y actualización tras cada sello
secrets/               Certificados y llaves de Wallet en local (ignorado por git)
src/prisma/            Conexión a la base de datos
src/config/            Validación de variables de entorno
```

## Documentación

| Qué | Dónde |
| --- | --- |
| Guía para agentes | [`CLAUDE.md`](CLAUDE.md) |
| Dominio, modelo de datos y reglas | [`agent/project-overview.md`](agent/project-overview.md) |
| Estándares de código | [`agent/coding-standards.md`](agent/coding-standards.md) |
| Flujo de trabajo | [`agent/ai-interaction.md`](agent/ai-interaction.md) |
| Sesión del equipo | [`agent/features/modulo_auth.md`](agent/features/modulo_auth.md) |
| Inscripción pública | [`agent/features/modulo_inscripcion.md`](agent/features/modulo_inscripcion.md) |
| Sellos y canjes | [`agent/features/modulo_sellos.md`](agent/features/modulo_sellos.md) |
| Wallet | [`agent/features/modulo_wallet.md`](agent/features/modulo_wallet.md) |
| Tarjeta y textos de la API | [`design-system.md`](design-system.md) |

## Próximos pasos

1. Permisos por rol y gestión del equipo (alta de cajeros, contraseñas).
2. Wallet: cargar las credenciales reales y probar en un iPhone y un Android.
3. Endpoints del backoffice: programa, clientes, cupones y notificaciones.
