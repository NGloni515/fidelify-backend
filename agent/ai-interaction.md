# AI Interaction Guidelines

## Comunicación

- Conciso y directo. Explicar lo no obvio, no lo evidente.
- Preguntar antes de refactors grandes o cambios de arquitectura.
- No agregar features que nadie pidió. El schema ya tiene modelos sin usar
  (`Coupon`, `Notification`): que existan no es una invitación a implementarlos.
- Nunca borrar archivos sin confirmar.

## Flujo por cambio

1. **Rama** desde `origin/main`: `feat/<algo>` o `fix/<algo>`.
2. **Implementar**.
3. **Verificar**: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`.
4. **Probar de verdad** si el cambio toca sellos, canjes o inscripción (ver
   abajo).
5. **Commit** solo cuando todo lo anterior pasa, y solo con permiso.
6. **PR** con las secciones **¿Qué?** y **¿Por qué?**.

## Commits

- Mensajes convencionales (`feat:`, `fix:`, `chore:`, `docs:`).
- Uno por cambio lógico.
- **Preguntar antes de commitear.** No auto-commitear.

## Verificar de verdad

Que compile y que pasen los tests no dice si un sello se suma. Con la base
arriba y el seed cargado:

```bash
npm run db:up && npm run db:migrate && npm run db:seed
npm run start:dev
```

- Inscribirse: `POST /api/public/businesses/heladeria-demo/join`. Repetirlo con
  el mismo teléfono tiene que devolver el **mismo** `serialNumber`.
- Las rutas de caja piden sesión: `POST /api/auth/login` con el equipo del seed
  (`.env.example`) y el `accessToken` como `Bearer`. Sin él, 401.
- Dar sellos hasta completar la tarjeta: el último tiene que venir con
  `rewardEarned: true`, `balance: 0` y `rewardsReady: 1`.
- Canjear dos veces seguidas: la segunda tiene que ser un 400 con el mensaje en
  español, no un 500.
- Un cambio de schema: revisar el SQL de la migración generada antes de
  commitearla.

## Orden de despliegue

**Este repo va primero.** Un campo nuevo en un body tiene que estar en el DTO
desplegado antes de que la web o el panel lo manden; si no, es un 400
(`"property X should not exist"`). Al hacer un cambio así, avisar el orden.

## Cuando algo no sale

- Si tras 2-3 intentos no funciona, parar y explicar el problema.
- No probar arreglos al azar.
- **El stack es muy reciente** (NestJS 12, Prisma 7, TypeScript 6, Vitest 4):
  lo que se recuerda de versiones anteriores puede ya no ser cierto. Se consulta
  la documentación actual antes de escribir contra estas APIs, y si algo no se
  puede verificar ahí, no se improvisa.

## Cambios de código

- El mínimo necesario para la tarea.
- No refactorizar lo que no se pidió.
- Respetar los patrones que ya existen en el repo.

## Revisión

Mirar con especial cuidado:

- **Aislamiento entre negocios**: ¿la consulta filtra por el negocio de quien
  pregunta?
- **Secretos y datos personales en las respuestas**: ¿se está devolviendo una
  fila entera?
- **Saldo**: ¿el cambio pasa por el bloqueo optimista y deja su movimiento?
