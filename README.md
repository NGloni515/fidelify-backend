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
npm run db:migrate   # crea las tablas (la primera vez pide un nombre: "init")
npm run db:seed      # crea "Heladería Demo" con su programa de sellos
npm run start:dev    # http://localhost:3000/api/health
```

## Endpoints actuales

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/health` | Estado del servicio |
| GET | `/api/public/businesses/:slug` | Datos del negocio y su programa (web pública) |
| POST | `/api/public/businesses/:slug/join` | Inscribe al cliente y crea su pase |
| GET | `/api/passes/:serial` | Consulta un pase (caja) |
| POST | `/api/passes/:serial/stamp` | Suma sellos `{ "count": 1 }` (caja) |
| POST | `/api/passes/:serial/redeem` | Canjea un premio (caja) |
| GET | `/api/wallet/apple/:serial` | Pase de Apple Wallet (pendiente) |
| GET | `/api/wallet/google/:serial` | Link de Google Wallet (pendiente) |

## Estructura

```
prisma/schema.prisma   Modelo de datos (negocios, clientes, pases, movimientos, cupones…)
src/public/            Inscripción desde la web pública
src/passes/            Sellos y canjes (stamp-rules.ts tiene la lógica pura + tests)
src/wallet/            Apple / Google Wallet (por implementar)
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
| Inscripción pública | [`agent/features/modulo_inscripcion.md`](agent/features/modulo_inscripcion.md) |
| Sellos y canjes | [`agent/features/modulo_sellos.md`](agent/features/modulo_sellos.md) |
| Wallet | [`agent/features/modulo_wallet.md`](agent/features/modulo_wallet.md) |
| Tarjeta y textos de la API | [`design-system.md`](design-system.md) |

## Próximos pasos

1. Autenticación del backoffice (dueño y cajeros) con JWT y permisos por negocio.
2. Apple Wallet: cuenta de Apple Developer, Pass Type ID, certificado y firma con `passkit-generator`; web service de actualizaciones.
3. Google Wallet: cuenta de issuer y cuenta de servicio en Google Cloud.
4. Endpoints del backoffice: programa, clientes, cupones y notificaciones.
