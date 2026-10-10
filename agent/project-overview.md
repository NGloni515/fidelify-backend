# Fidelify — especificación del proyecto

## Problema

Los negocios de barrio —heladerías, cafeterías— premian a sus clientes fieles
con una tarjeta de cartón que se pierde y que no les deja ningún dato. Fidelify
es esa tarjeta de sellos guardada en la billetera del celular (Apple Wallet,
Google Wallet): el cliente final no instala nada, y el negocio por fin sabe
quiénes son sus clientes, cada cuánto vuelven y cómo escribirles.

---

## Alcance de la plataforma

| Repo | Qué es | Quién lo usa | Identidad |
|---|---|---|---|
| **`fidelify-backend`** (este) | lógica de negocio, datos y cálculos | — | — |
| `fidelify-web` | página pública de inscripción | el cliente final, anónimo, en su celular | ninguna: el `slug` de la URL |
| `fidelify-backoffice` | panel del negocio: caja, clientes, tarjeta, cupones, mensajes, equipo | dueño y cajeros | `StaffUser`, con sesión |

No existe un panel interno de Fidelify. Un negocio se da de alta con
`npm run business:create`, que crea el `Business`, su local, su programa y su
dueño con una contraseña temporal. Nunca pisa un negocio existente: si el
`slug` o el correo ya están tomados, se niega.

---

## Vocabulario

El usuario y el código no hablan igual. En pantalla siempre va la columna
izquierda.

| En pantalla | En el código |
|---|---|
| negocio | `Business` |
| local | `Branch` |
| equipo: dueño, cajera | `StaffUser` (`OWNER`, `CASHIER`) |
| tarjeta de sellos (el programa) | `Program` |
| cliente | `Customer` |
| tarjeta (la de un cliente) | `Pass` |
| código de la tarjeta | `Pass.serialNumber` |
| sellos | `Pass.balance` |
| premios disponibles | `Pass.rewardsReady` |
| dar sello / canjear | `Transaction` de tipo `STAMP` / `REDEEM` |
| cupón | `Coupon` |
| mensaje | `Notification` |

---

## Modelo de tenencia

```
Business (negocio)                slug único → /join/:slug
  ├── Branch (local)
  ├── StaffUser (dueño / cajera)
  ├── Program (tarjeta de sellos)
  │     └── Pass (tarjeta de un cliente)
  │           ├── Transaction (movimientos)
  │           └── AppleDeviceRegistration
  ├── Customer (cliente final)
  │     └── Pass
  ├── Coupon
  │     └── CouponRedemption
  └── Notification
```

`Business`, `Branch`, `StaffUser`, `Program`, `Customer`, `Coupon` y
`Notification` llevan `businessId`. **`Pass`, `Transaction`,
`CouponRedemption` y `AppleDeviceRegistration` no**: su negocio se alcanza por
el padre (`pass.program.businessId`, `coupon.businessId`).

---

## Entidades

### Business

`name`, `slug`, `logoUrl`, `colors` (Json `{ background, foreground, label }`),
`plan` (`BASIC` | `PRO`), `active`.

El `slug` es la identidad pública del negocio: está en el link de inscripción y
**en el QR impreso del mostrador**. Cambiarlo rompe los letreros ya impresos.

Un negocio con `active = false` no existe para la página pública.

### Program

`name`, `type` (`STAMPS` | `POINTS`), `stampsRequired` (8 por defecto),
`rewardText` ("1 helado gratis"), `design` (Json, sin forma definida todavía),
`active`.

Solo `STAMPS` tiene lógica. `POINTS` existe en el enum y en ningún otro lado.

En la práctica hay **un programa activo por negocio**: la página pública toma el
activo más antiguo e ignora los demás.

### Customer

`name`, `phone`, `email?`, `birthDate?`, `consentAt`, `consentText`.

Único por `(businessId, phone)`: **el teléfono es la identidad del cliente
dentro de un negocio**. La misma persona en dos negocios son dos `Customer` sin
relación.

`consentAt` y `consentText` son obligatorios: es la evidencia de consentimiento
que exige la LOPDP. No se puede crear un cliente sin ellos.

### Pass — CRÍTICO

La tarjeta de un cliente en un programa. Única por `(programId, customerId)`.

| Campo | Qué |
|---|---|
| `serialNumber` | `FL-` + 12 caracteres. Es lo que lleva el QR de la tarjeta |
| `authToken` | secreto con el que Apple Wallet se autenticará contra esta API. **No debe salir en ninguna respuesta** |
| `balance` | sellos acumulados hacia el próximo premio. Siempre entre `0` y `stampsRequired - 1` |
| `rewardsReady` | premios ganados y todavía no canjeados |
| `status` | `ACTIVE` \| `VOIDED`. Una tarjeta `VOIDED` no existe para la caja |
| `platform` | dónde quedó guardada. Se marca `APPLE` cuando un iPhone registra la tarjeta |
| `googleObjectId` | sin uso: el id en Google se deriva del id de la tarjeta |

`balance` y `rewardsReady` son un **saldo cacheado**. El registro de lo que
pasó es `Transaction`.

### Transaction

Un renglón por cada cambio de saldo: `type` (`STAMP` | `REDEEM` | `ADJUST`),
`amount`, y opcionalmente `staffId`, `branchId`, `note`.

Solo se insertan. Nunca se editan ni se borran.

### AppleDeviceRegistration

Un renglón por cada iPhone que guardó una tarjeta: a dónde mandarle el push
cuando esa tarjeta cambia. Lo escribe y lo borra el propio Apple Wallet, a
través del web service (ver `modulo_wallet.md`).

### Coupon, CouponRedemption, Notification

Existen en el schema y **ningún código los usa todavía**.

---

## Reglas de negocio críticas

### 1. Los sellos los calcula el backend

Las reglas viven en `src/passes/stamp-rules.ts`, como funciones puras con sus
tests. La caja manda cuántos sellos dar; nunca el saldo resultante.

### 2. Todo cambio de saldo deja un movimiento

El saldo del `Pass` y el `Transaction` que lo explica se escriben **en la misma
transacción de base de datos**. Un saldo que cambia sin movimiento es un sello
que nadie puede explicarle al dueño del negocio.

### 3. Dos escaneos a la vez no se pisan

El saldo se guarda solo si nadie lo cambió desde que se leyó (bloqueo
optimista). Ver `modulo_sellos.md`.

### 4. Inscribirse dos veces devuelve la misma tarjeta

La inscripción es idempotente por teléfono: no duplica al cliente ni le crea una
segunda tarjeta.

### 5. Sin consentimiento no hay cliente

El `consent` del formulario tiene que ser `true`, y se guarda el texto exacto
que el cliente aceptó, servido por esta misma API.

### 6. Aislamiento entre negocios

Un dato de un negocio nunca se le muestra a otro. Lo ajeno se responde 404.

El negocio sale del `slug` en las rutas públicas y de la sesión en las del
panel. Nunca de un campo del body.

---

## Mapa de módulos

| Dominio | `src/` | Estado | Doc |
|---|---|---|---|
| Sesión del equipo | `auth/` | funcional | [`modulo_auth`](features/modulo_auth.md) |
| Inscripción pública | `public/` | funcional | [`modulo_inscripcion`](features/modulo_inscripcion.md) |
| Sellos y canjes (caja) | `passes/` | funcional | [`modulo_sellos`](features/modulo_sellos.md) |
| Wallet | `wallet/` | funcional con credenciales; 501 sin ellas. Sin probar en teléfonos | [`modulo_wallet`](features/modulo_wallet.md) |
| Salud | `health/` | funcional | — |
| Infraestructura | `prisma/`, `config/`, `common/` | — | — |

## Endpoints

Todos bajo el prefijo `/api`.

| Método | Ruta | Quién la llama |
|---|---|---|
| GET | `/health` | monitoreo |
| POST | `/auth/login` | panel |
| POST | `/auth/refresh` | panel |
| POST | `/auth/logout` | panel |
| GET | `/auth/me` | panel, con sesión |
| GET | `/public/businesses/:slug` | página pública |
| POST | `/public/businesses/:slug/join` | página pública |
| GET | `/passes/:serial` | caja, con sesión |
| POST | `/passes/:serial/stamp` | caja, con sesión |
| POST | `/passes/:serial/redeem` | caja, con sesión |
| GET | `/wallet/apple/:serial` | el celular del cliente |
| GET | `/wallet/google/:serial` | el celular del cliente |
| varios | `/wallet/apple/v1/…` | Apple Wallet, por su cuenta |

---

## Lo que el producto promete y todavía no existe

Es lo que se le ofrece a un negocio. Sirve para saber hacia dónde crece el
modelo, no para implementarlo sin que se pida.

- **Permisos por rol** y gestión del equipo desde el panel: alta de cajeras,
  cambio y recuperación de contraseña.
- **Subir el logo del negocio**: la tarjeta ya lo muestra, pero hoy tiene que
  ser una URL pública puesta a mano.
- **Panel del dueño**: cuántos clientes tiene, quiénes vienen más seguido,
  quiénes dejaron de venir.
- **Mensajes directos al celular** de los clientes, a todos o a un grupo.
- **Cupones con fecha de vencimiento**, incluidos los de cumpleaños (por eso la
  inscripción ya pide `birthDate`).
- **Ajuste manual de sellos** desde el panel (el tipo `ADJUST` ya existe).

---

## Errores comunes a evitar

- Devolver un `Pass` completo: arrastra `authToken`.
- Buscar un `Pass`, un `Coupon` o un `Customer` solo por `id` o por serial, sin
  acotar al negocio de quien pregunta.
- Cambiar `balance` o `rewardsReady` sin insertar el `Transaction`.
- Escribir el saldo con un `update` directo, saltándose el bloqueo optimista.
- Lanzar `Error` a secas desde una regla de negocio: llega al cliente como 500.
- Mandar al cliente un campo que el DTO todavía no declara en producción.
- Olvidar la extensión `.js` en un import relativo.
- Dejar que un servicio externo (Google, Apple) haga fallar un sello que ya se
  guardó.
