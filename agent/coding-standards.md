# Coding Standards

Las reglas de dominio viven en `agent/features/*.md`; este archivo es sobre cómo
se escribe el código.

## TypeScript

- Modo estricto. Sin `any`: el tipo real o `unknown`. El linter **no** lo marca
  (`no-explicit-any` está apagado en `oxlint.json`), así que depende de quien
  escribe.
- **Proyecto ESM.** Todo import relativo lleva `.js`:
  `import { PassesService } from './passes.service.js'`.
- Inferencia donde es obvia, tipos explícitos donde ayudan.

## NestJS

- Módulos, controladores y servicios según las convenciones de Nest.
- Servicios con `@Injectable()`, inyectados por constructor.
- **Controladores delgados.** Reciben, validan con el DTO y delegan. La lógica va
  en el servicio.
- Un DTO con `class-validator` por cada body. El `ValidationPipe` global corre
  con `whitelist`, `forbidNonWhitelisted` y `transform`: un campo no declarado
  en el DTO es un 400.

## Este servicio es dueño de la lógica de negocio

La página pública y el panel capturan y muestran; **todo cálculo y toda regla
que decide si algo se puede guardar vive aquí**. Cuando un cliente muestra un
número, tiene que ser un número que produjo este servicio.

- **Se expone el resultado, no los ingredientes.** Si la caja necesita saber si
  el cliente acaba de ganar un premio, se devuelve `rewardEarned`; no se la deja
  deducirlo comparando saldos.
- **Toda regla se hace cumplir aquí**, aunque el cliente también la chequee. El
  chequeo del cliente es feedback; este es la garantía. Todo lo que se alcanza
  por HTTP termina siendo alcanzado sin el cliente.
- **Se rechaza con un mensaje útil.** Los dos frontends muestran el `message` de
  la respuesta tal cual: ese texto es interfaz. Ver `design-system.md`.
- Los textos y valores de configuración que ve el usuario (el texto de
  consentimiento, `stampsRequired`, `rewardText`) se sirven desde aquí. Una
  copia en un cliente se queda vieja en silencio.

## Reglas puras, aparte de la base de datos

Una regla de negocio que se puede expresar sin base de datos va en un archivo
propio de funciones puras, con su `*.spec.ts` al lado. El servicio lee, llama a
la función y guarda. El modelo es `src/passes/stamp-rules.ts`.

- Las funciones puras lanzan `Error`; **el servicio lo traduce** a una excepción
  HTTP de Nest. Un `Error` a secas que llega al controlador es un 500.
- Los valores esperados de un test se calculan a mano, nunca se pegan de una
  corrida. Un test que falla significa que cambió el comportamiento: se entiende
  qué se movió antes de tocar el número.

## Multi-negocio

- **Todo método de servicio que lee o escribe datos de un negocio recibe de qué
  negocio se trata y filtra por él.** En las rutas del panel recibe el
  `StaffSession` (`@CurrentStaff()`) y usa `staff.business.id`; en las públicas,
  el `slug` de la ruta. Nunca un `businessId` del body.
- Se acota por la columna más cercana. Si el modelo no tiene `businessId`
  propio, se filtra por el padre: `Pass` → `program: { businessId }`,
  `Transaction` → `pass: { program: { businessId } }`.
- Un registro de otro negocio es **no encontrado (404)**, nunca prohibido (403):
  quien pregunta no tiene por qué enterarse de que ese id existe en otro lado.
- `findFirst` con el filtro de negocio, no `findUnique` solo por id o por serial.

## Saldo y movimientos

- El saldo de un `Pass` se cambia **solo** a través del patrón de
  `PassesService.commit()`: `updateMany` condicionado al saldo que se leyó, más
  el `Transaction`, dentro de un `$transaction`.
- Nunca un `update` directo sobre `balance` o `rewardsReady`.
- Nunca se edita ni se borra un `Transaction`. Un error se corrige con otro
  movimiento (`ADJUST`).

## Base de datos

- Todo acceso pasa por Prisma.
- Cambios de schema con `prisma migrate dev` (`npm run db:migrate`), no con
  `db push`. Las migraciones se commitean.
- Producción corre `prisma migrate deploy` antes de arrancar la app.
- Todo modelo lleva `createdAt`. Los que se editan llevan además
  `updatedAt @updatedAt`.

## Datos personales

- Teléfono, correo y fecha de nacimiento no se escriben en logs ni en mensajes
  de error, y no viajan en la URL.
- Una respuesta lleva de `Customer` solo los campos que la pantalla necesita:
  `select` explícito, no la fila entera.
- `consentAt` y `consentText` se escriben al crear el cliente y no se
  sobrescriben.

## Validación y errores

- Toda entrada se valida con un DTO.
- Las excepciones de dominio extienden una excepción HTTP de Nest
  (`BadRequestException`, `NotFoundException`…), nunca `Error` a secas.
- En un `catch` de servicio, dejar pasar lo que ya es HTTP antes de envolver:
  `if (error instanceof HttpException) throw error;`. Si no, un 400 con un
  mensaje útil se vuelve un 500 genérico.
- Los mensajes de error van en español y dicen qué hacer. `class-validator`
  responde en inglés por defecto: los campos que el cliente final llena llevan
  `message` propio.

## Naming

- Archivos: kebab-case, con el sufijo del recurso de Nest (`passes.service.ts`).
- Funciones: camelCase. Constantes: SCREAMING_SNAKE_CASE.
- Tipos e interfaces: PascalCase, sin prefijo.
- El código va en inglés; los textos que ve el usuario, en español.

## Tests

Dos capas, las dos con **Vitest**:

- **Unitarios** — `*.spec.ts` junto al código que prueban, en `src/`. Sin base
  de datos. `npm test`.
- **E2E** — `test/*.e2e-spec.ts`, con Supertest sobre la app de Nest completa y
  una base Postgres real (`fidelify_test`). `npm run test:e2e`.
  - La app se arma con `createTestApp()` (`test/helpers/app.ts`), que aplica
    `configureApp()`: el mismo prefijo `/api` y el mismo `ValidationPipe` que
    producción.
  - Cada spec llama a `resetDatabase()` en su `beforeEach` y crea lo que
    necesita con `createBusiness()` (`test/helpers/fixtures.ts`).
  - **Toda ruta que toca datos de un negocio lleva un test con dos negocios**,
    que compruebe que el segundo no se ve ni se modifica.

## Calidad

- Sin código comentado. Sin imports ni variables sin usar.
- Funciones de menos de 50 líneas cuando se pueda.

### Comentarios

- **Los comentarios se escriben en inglés**, aunque la documentación esté en
  español.
- Escribir el **mínimo**. Por defecto, ninguno.
- Nunca describir *qué* hace el código ni narrar los pasos: el código ya lo dice.
- Comentar solo un **porqué** no obvio: una decisión, un workaround, una
  restricción externa, o algo fácil de romper sin darse cuenta.
- Preferir un nombre claro a un comentario. Ante la duda, no comentar.

## Deuda

Se paga por arrastre: el archivo que se toca por otra razón sale cumpliendo. No
se abren PRs masivos de limpieza.

| Qué | Dónde |
|---|---|
| Comentarios en español y docstrings que narran | `src/public/`, `src/wallet/`, `src/common/`, `src/config/`, `src/passes/stamp-rules.ts`, `prisma/schema.prisma` |
| `Branch`, `StaffUser`, `Customer` y `Coupon` se editan y no tienen `updatedAt` | `prisma/schema.prisma` |
| El comentario de `Transaction.amount` dice "-8 al canjear"; el código guarda `-1` | `prisma/schema.prisma` |
| `name` y `email` responden con el mensaje en inglés de `class-validator` | `src/public/join.dto.ts` |

## Documentación de agente

- `agent/features/*.md` describen cómo funciona un módulo *hoy*: modelos,
  reglas, fórmulas, mapa de archivos. Nunca un changelog: nada de "antes de
  esto…", "se corrigió", ni referencias a un PR o a un bug pasado. Si una regla
  necesita justificarse, se explica la restricción, no su historia.
- Una regla que aplica a más de un módulo va en este archivo, no en el doc de
  una feature.
