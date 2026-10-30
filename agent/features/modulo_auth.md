# Módulo Sesión del equipo

Quién está usando el panel y de qué negocio es. Su contraparte es
`fidelify-backoffice/agent/features/modulo_sesion.md`.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/auth/auth.controller.ts` | Rutas bajo `/auth` y la cookie de refresh |
| `src/auth/auth.service.ts` | Valida credenciales, emite y verifica tokens |
| `src/auth/password.ts` | Hash y verificación de contraseñas (`scrypt`) |
| `src/auth/attempt-limiter.ts` | Límite de intentos con contraseña, en memoria |
| `src/auth/staff-auth.guard.ts` | `StaffAuthGuard`: exige sesión en una ruta |
| `src/auth/owner.guard.ts` | `OwnerGuard`: además, exige que sea el dueño |
| `src/auth/current-staff.decorator.ts` | `@CurrentStaff()`: la sesión dentro del controlador |
| `src/auth/staff-session.ts` | El tipo `StaffSession` |
| `src/auth/dto/login.dto.ts` | Validación del login |
| `src/auth/dto/change-password.dto.ts` | Validación del cambio de contraseña |

---

## Quién inicia sesión

Un `StaffUser`: el dueño (`OWNER`) o quien atiende la caja (`CASHIER`) de **un**
negocio. No hay registro público. El dueño se crea al dar de alta el negocio
(`npm run business:create`), que imprime una contraseña temporal una sola vez;
las cajeras las agrega el dueño desde el panel (ver
[`modulo_equipo`](modulo_equipo.md)); el seed crea el equipo de desarrollo.

El correo se guarda y se compara **en minúsculas**.

---

## Dos tokens

| | Access | Refresh |
|---|---|---|
| Dónde viaja | cabecera `Authorization: Bearer …` | cookie `fidelify_refresh` |
| Dónde lo guarda el panel | en memoria | no lo ve: la cookie es `HttpOnly` |
| Dura | 15 min (`JWT_ACCESS_TTL_SECONDS`) | 30 días (`JWT_REFRESH_TTL_SECONDS`) |
| Firmado con | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` |

Los dos llevan solo `sub` (el id del `StaffUser`) y `typ`. **El rol y el negocio
no van en el token**: se leen de la base en cada petición.

Un token de un tipo no sirve como el otro, aunque los dos secretos fueran
iguales: `typ` se verifica.

El refresh dura 30 días a propósito: la tablet de la caja no puede pedir la
contraseña cada mañana con el local abriendo.

### La cookie

`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, y `Secure` cuando
`NODE_ENV=production`. El `Path` hace que el refresh no viaje con cada sello;
solo con las rutas de sesión.

`SameSite=Lax` exige que el panel y la API estén en el **mismo sitio**: el mismo
origen (el panel reenvía `/api`) o dos subdominios del mismo dominio. En dos
dominios distintos el navegador no manda la cookie y la sesión no sobrevive una
recarga.

---

## Cada petición vuelve a mirar la base

`StaffAuthGuard` no confía en lo que dice el token más allá del id. En cada
petición busca al `StaffUser` y exige que esté `active` y que su negocio esté
`active`. Lo que queda en `request.staff` es un `StaffSession` recién leído:

```ts
{ id, name, email, role, branchId, business: { id, name, slug } }
```

Consecuencias:

- **Desactivar a alguien lo saca en la siguiente petición**, sin esperar a que
  venza nada.
- **Cambiarle el rol aplica de inmediato.**
- **No hay tabla de sesiones.** Cerrar sesión borra la cookie de ese navegador
  y nada más; un refresh robado sigue sirviendo hasta que venza. La forma real
  de cortarlo es desactivar al usuario.

---

## Contrato

Todas bajo `/api/auth`.

### `POST /login`

Body: `{ "email": "…", "password": "…" }`. Responde 200 y fija la cookie:

```json
{
  "accessToken": "…",
  "expiresIn": 900,
  "user": {
    "id": "…", "name": "…", "email": "…", "role": "CASHIER", "branchId": "…",
    "business": { "id": "…", "name": "…", "slug": "…" }
  }
}
```

El refresh **nunca** va en el body.

### `POST /refresh`

Sin body. Lee la cookie, responde lo mismo que el login y renueva la cookie por
otros 30 días.

### `POST /logout`

Sin body. Borra la cookie. 204.

### `GET /me`

Con `Authorization`. Devuelve el `user`.

### `POST /password`

Con `Authorization`. Body: `{ "currentPassword": "…", "newPassword": "…" }`.
204. Es la única forma de cambiar la contraseña propia, dueño o cajera, y pide
la actual aunque haya sesión: un panel olvidado abierto no basta para quedarse
con la cuenta.

Las sesiones que ya estaban abiertas siguen valiendo: no hay tabla de sesiones
que cerrar.

### Errores

| Caso | Respuesta |
|---|---|
| Correo desconocido, contraseña incorrecta, usuario inactivo o negocio inactivo | 401 "Correo o contraseña incorrectos" |
| Ruta protegida sin `Authorization` | 401 "Inicia sesión para continuar" |
| Token vencido o inválido, sin cookie, o usuario desactivado | 401 "Tu sesión venció. Vuelve a entrar." |
| Contraseña actual incorrecta al cambiarla | 400 "Tu contraseña actual no es correcta" |
| Contraseña nueva de menos de 8 caracteres | 400 "La contraseña debe tener al menos 8 caracteres" |
| Límite de intentos alcanzado | 429 "Demasiados intentos. Vuelve a intentar en N minutos." |

Los cuatro motivos de un login fallido **no se distinguen**, ni por el mensaje
ni por el tiempo de respuesta: cuando el correo no existe igual se verifica una
contraseña contra un hash de relleno.

---

## Límite de intentos

**5 intentos con contraseña por correo cada 15 minutos.** El sexto responde 429,
aunque traiga la contraseña correcta, hasta que pasen los 15 minutos contados
desde el primero. Un login exitoso, o un cambio de contraseña con la actual
correcta, devuelve los intentos.

- **Se cuenta por correo, no por IP.** El panel le habla a esta API a través
  de su proxy en Cloudflare: todos los logins que vienen del panel llegan
  desde las mismas pocas direcciones, y un límite por IP sería un límite para
  todos los negocios a la vez.
- **Un correo que no existe se bloquea igual**, para que el límite no revele
  qué correos tienen cuenta.
- **El intento se cuenta antes de verificar la contraseña.** Contar después de
  fallar dejaría pasar una ráfaga de peticiones en paralelo antes de que la
  primera termine.
- **Login y cambio de contraseña comparten el contador.** Si no, quien tenga
  una sesión robada podría probar contraseñas por `POST /password` sin freno.
- **Vive en memoria.** Reiniciar la app devuelve los intentos, y con más de una
  réplica cada una llevaría su propia cuenta. Hoy corre una sola.
- La contracara: cualquiera que conozca un correo puede bloquearlo 15 minutos.
  A la tablet de la caja no le afecta, porque su sesión dura 30 días y no
  vuelve a pedir la contraseña.

---

## Roles

`OWNER` y `CASHIER`. Una ruta solo para el dueño lleva
`@UseGuards(StaffAuthGuard, OwnerGuard)`, en ese orden: `OwnerGuard` lee el
`request.staff` que deja el primero. A una cajera le responde 403 "Solo el
dueño del negocio puede hacer esto".

Hoy solo Equipo es exclusiva del dueño. La caja la usan los dos.

---

## Contraseñas

`scrypt` de Node, sin dependencias, con N=2¹⁵, r=8, p=3 y una sal por
contraseña. Se guarda como
`scrypt$<log2 N>$<r>$<p>$<sal>$<hash>`: los parámetros viajan con el hash para
poder subirlos sin invalidar las contraseñas existentes.

Una contraseña nueva tiene entre 8 y 200 caracteres (`IsNewPassword`), venga del
cambio propio o del dueño para una cajera. Las que imprimen
`business:create` y `staff:reset-password` son de 16 caracteres al azar.

---

## Proteger una ruta

```ts
@Controller('passes')
@UseGuards(StaffAuthGuard)
export class PassesController {
  @Get(':serial')
  find(@Param('serial') serial: string, @CurrentStaff() staff: StaffSession) {
    return this.service.findForCashier(serial, staff);
  }
}
```

El módulo que usa el guard importa `AuthModule`. El servicio recibe el
`StaffSession` entero y filtra por `staff.business.id`: de ahí sale el negocio,
nunca del body ni de la URL.

---

## Sin resolver

- **Recuperar la contraseña por correo.** Hoy lo hace soporte con
  `npm run staff:reset-password` (ver [`modulo_equipo`](modulo_equipo.md)).
- **Revocar una sesión** sin desactivar al usuario. Por lo mismo, cambiar la
  contraseña no cierra las sesiones abiertas.
- **Límite por IP**, contra quien prueba muchas cuentas a la vez. Exige que el
  proxy del panel le pase al backend la IP real de forma que no se pueda
  falsificar llamando directo a la API.
