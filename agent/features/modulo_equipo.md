# Módulo Equipo

El dueño administra a sus cajeras desde el panel: las ve, las agrega, las
desactiva y les cambia la contraseña cuando la olvidan. Su contraparte es
`fidelify-backoffice/agent/features/modulo_equipo.md`.

Cómo se entra y cómo vive la sesión está en [`modulo_auth`](modulo_auth.md).

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/staff/staff.controller.ts` | Rutas bajo `/staff`, detrás de `StaffAuthGuard` y `OwnerGuard` |
| `src/staff/staff.service.ts` | Lista, alta y cambios, siempre acotados al negocio de la sesión |
| `src/staff/dto/create-staff.dto.ts` | Validación del alta |
| `src/staff/dto/update-staff.dto.ts` | Validación de los cambios |
| `src/auth/owner.guard.ts` | `OwnerGuard`: deja pasar solo al dueño |
| `src/auth/dto/is-new-password.ts` | La regla de una contraseña nueva, compartida con el cambio de contraseña |
| `prisma/reset-password.ts` | Contraseña temporal para cualquier usuario, desde soporte |
| `test/staff.e2e-spec.ts` | Roles, reglas y aislamiento entre negocios |

---

## Reglas

- **Solo el dueño entra a estas rutas.** Una cajera recibe 403 "Solo el dueño
  del negocio puede hacer esto". Que el panel le oculte la sección es
  cosmética; esto es la garantía.
- **Desde el panel solo se agregan cajeras.** El rol no viaja en el body
  (mandarlo es un 400): todo usuario creado aquí es `CASHIER`. El dueño de un
  negocio es el que crea `npm run business:create`.
- **Solo se cambian cuentas de cajeras.** Un `OWNER`, incluido el propio dueño
  que pregunta, responde 403. Si el dueño pudiera desactivarse a sí mismo, el
  negocio se quedaría sin nadie que administre el equipo. Su propia contraseña
  la cambia en `POST /auth/password`.
- **La contraseña de una cajera nueva la pone el dueño** y se la dice en
  persona. Ella puede cambiarla después desde *Mi cuenta*.
- **El correo es único en todo Fidelify**, no por negocio: el login entra solo
  con correo. Un correo usado en otro negocio responde 409 igual que uno del
  mismo.
- La cajera nueva queda en el local del dueño o, si él no tiene, en el primer
  local del negocio.
- **Desactivar a una cajera la corta en su siguiente petición**: el guard
  revalida al usuario en cada una. Cambiarle la contraseña **no** cierra las
  sesiones que ya tiene abiertas; para cortarla de inmediato se la desactiva.
- Nada de esto borra usuarios. Una cajera desactivada sigue firmando los sellos
  que dio.

---

## Contrato

Todas bajo `/api/staff`, con `Authorization: Bearer …` de un dueño.

Cada usuario se responde con estos campos y ningún otro:

```json
{
  "id": "…",
  "name": "Ana Pérez",
  "email": "ana@negocio.com",
  "role": "CASHIER",
  "active": true,
  "createdAt": "2026-10-30T12:00:00.000Z"
}
```

### `GET /`

El equipo del negocio: dueños primero, después por antigüedad.

### `POST /`

Body: `{ "name": "…", "email": "…", "password": "…" }`. 201 con el usuario
creado. El nombre y el correo llegan sin espacios de sobra; el correo, en
minúsculas.

### `PATCH /:id`

Body: `{ "active"?: boolean, "password"?: "…" }`, al menos uno. 200 con el
usuario como queda.

### Errores

| Caso | Respuesta |
|---|---|
| Sin sesión | 401 |
| Quien pregunta es cajera | 403 "Solo el dueño del negocio puede hacer esto" |
| Correo ya usado, en este negocio o en otro | 409 "Ya existe un usuario con ese correo" |
| Contraseña de menos de 8 caracteres | 400 "La contraseña debe tener al menos 8 caracteres" |
| `PATCH` sin `active` ni `password` | 400 "No hay nada que cambiar" |
| `PATCH` a un usuario de otro negocio, o que no existe | 404 "Usuario no encontrado" |
| `PATCH` a un dueño | 403 "Desde Equipo solo se cambian las cuentas de las cajeras" |

---

## Cuando el dueño olvida su contraseña

No hay recuperación por correo: Fidelify no envía correos todavía. Lo resuelve
soporte, desde una máquina de desarrollo y contra la base del negocio:

```bash
npm run staff:reset-password -- --email dueno@negocio.com
```

Imprime una contraseña temporal **una sola vez**. Sirve para cualquier usuario,
dueño o cajera, y no reactiva una cuenta desactivada (avisa si lo está).

---

## Sin resolver

- **Recuperar la contraseña sin soporte**, con un enlace al correo.
- **Más de un dueño por negocio**, y con eso, cambiar el rol de alguien.
- **Corregir el nombre o el correo** de una cajera: hoy se desactiva y se crea
  otra.
