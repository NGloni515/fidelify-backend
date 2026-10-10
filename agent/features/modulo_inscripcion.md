# Módulo Inscripción pública

Los dos endpoints abiertos que usa la página pública: mostrar el programa de un
negocio e inscribir a un cliente. Su contraparte es
`fidelify-web/agent/features/modulo_inscripcion.md`.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/public/public.controller.ts` | Rutas bajo `/public/businesses` |
| `src/public/public.service.ts` | Lectura del programa, inscripción, `CONSENT_TEXT` |
| `src/public/join.dto.ts` | Validación del formulario |
| `src/common/serial.ts` | Genera `serialNumber` y `authToken` de la tarjeta nueva |

---

## Quién llama

Un cliente final **anónimo**, desde su celular, después de escanear el QR del
mostrador. No hay sesión ni token: el `slug` de la URL dice de qué negocio se
trata, y es lo único que acota la consulta.

---

## `GET /api/public/businesses/:slug`

Lo que la página necesita para pintarse:

```json
{
  "business": { "name": "…", "slug": "…", "logoUrl": null, "colors": { "background": "#…", "foreground": "#…", "label": "#…" } },
  "program": { "id": "…", "name": "…", "type": "STAMPS", "stampsRequired": 8, "rewardText": "1 helado gratis" },
  "consentText": "…"
}
```

404 "Negocio no encontrado" en tres casos que **no se distinguen** hacia
afuera: el `slug` no existe, el negocio está inactivo, o no tiene ningún
programa activo.

Si el negocio tiene varios programas activos se devuelve el **más antiguo**.

`consentText` viaja en la respuesta a propósito: el texto que el cliente lee y
el que queda guardado como evidencia son el mismo, porque los dos salen de la
constante `CONSENT_TEXT`.

---

## `POST /api/public/businesses/:slug/join`

### Body

| Campo | Regla |
|---|---|
| `name` | texto, 2 a 80 caracteres |
| `phone` | solo dígitos, con `+` opcional al inicio, 9 a 15 dígitos |
| `email` | opcional, correo válido |
| `birthDate` | opcional, fecha ISO 8601 |
| `consent` | **tiene que ser `true`** |

Un campo que no esté en esta tabla es un 400.

### Qué hace

En una sola transacción:

1. Busca al cliente por `(negocio, teléfono)`. Si no existe lo crea, con
   `consentAt = ahora` y `consentText = CONSENT_TEXT`.
2. Busca su tarjeta en el programa. Si no existe la crea, con saldo 0 y un
   `serialNumber` y un `authToken` nuevos.

### Respuesta (201)

```json
{
  "serialNumber": "FL-…",
  "balance": 0,
  "stampsRequired": 8,
  "appleWalletUrl": "/api/wallet/apple/FL-…",
  "googleWalletUrl": "/api/wallet/google/FL-…"
}
```

Las dos URLs son **rutas relativas de esta API**; la página les antepone el
host. Cada una responde 501 mientras su plataforma no tenga credenciales (ver
`modulo_wallet.md`).

---

## Reglas

### El teléfono es la identidad

Un cliente es único por `(businessId, phone)`. Inscribirse otra vez con el mismo
teléfono **no crea nada**: devuelve la tarjeta que ya tenía, con su saldo. Es lo
que permite recuperar la tarjeta al cambiar de celular.

La contracara: **quien conoce el teléfono de alguien obtiene el código de su
tarjeta.** Por eso el código solo no basta para sumar sellos: la caja exige
sesión.

### Qué se actualiza al reinscribirse

Solo `name`, y `email` si vino. **No** se tocan `birthDate`, `consentAt` ni
`consentText`: la evidencia de consentimiento es la de la primera vez.

### El teléfono no se normaliza

Se guarda tal como llega, validando solo el formato. `0991234567` y
`+593991234567` son **dos clientes distintos** con dos tarjetas. La página quita
espacios y guiones antes de mandar, y nada más.

### Consentimiento

`consent: false` o ausente es un 400 con "Debes aceptar el uso de tus datos para
inscribirte". No existe un camino que cree un `Customer` sin `consentAt`.

---

## El `slug`

Es la identidad pública del negocio y va **impreso en el QR del mostrador**.
Cambiarlo deja todos los letreros apuntando a un 404.

---

## Sin resolver

- **Normalización del teléfono**, para que el mismo número escrito de dos formas
  no produzca dos clientes.
- **Abuso.** No hay límite de intentos: cualquiera puede inscribir teléfonos
  ajenos o enumerar los códigos de las tarjetas existentes.
- **Baja de datos.** El texto de consentimiento promete que el cliente puede
  pedir que se eliminen sus datos; no existe todavía la forma de hacerlo.
- **Cambio del texto de consentimiento.** Si `CONSENT_TEXT` cambia, los clientes
  ya inscritos conservan el anterior y no se les vuelve a pedir.
