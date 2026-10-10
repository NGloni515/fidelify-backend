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
| `src/auth/staff-auth.guard.ts` | `StaffAuthGuard`: exige sesión en una ruta |
| `src/auth/current-staff.decorator.ts` | `@CurrentStaff()`: la sesión dentro del controlador |
| `src/auth/staff-session.ts` | El tipo `StaffSession` |
| `src/auth/dto/login.dto.ts` | Validación del login |

---

## Quién inicia sesión

Un `StaffUser`: el dueño (`OWNER`) o quien atiende la caja (`CASHIER`) de **un**
negocio. No hay registro público ni recuperación de contraseña. El dueño se
crea al dar de alta el negocio (`npm run business:create`), que imprime una
contraseña temporal una sola vez; el seed crea el equipo de desarrollo.

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

### Errores

| Caso | Respuesta |
|---|---|
| Correo desconocido, contraseña incorrecta, usuario inactivo o negocio inactivo | 401 "Correo o contraseña incorrectos" |
| Ruta protegida sin `Authorization` | 401 "Inicia sesión para continuar" |
| Token vencido o inválido, sin cookie, o usuario desactivado | 401 "Tu sesión venció. Vuelve a entrar." |

Los cuatro motivos de un login fallido **no se distinguen**, ni por el mensaje
ni por el tiempo de respuesta: cuando el correo no existe igual se verifica una
contraseña contra un hash de relleno.

---

## Contraseñas

`scrypt` de Node, sin dependencias, con N=2¹⁵, r=8, p=3 y una sal por
contraseña. Se guarda como
`scrypt$<log2 N>$<r>$<p>$<sal>$<hash>`: los parámetros viajan con el hash para
poder subirlos sin invalidar las contraseñas existentes.

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

- **Límite de intentos.** El login no frena a quien prueba contraseñas.
- **Roles.** `role` llega en la sesión, pero ninguna ruta distingue todavía al
  dueño de la cajera.
- **Alta y gestión del equipo.** No hay endpoint para crear usuarios, cambiar
  una contraseña ni recuperarla.
- **Revocar una sesión** sin desactivar al usuario.
