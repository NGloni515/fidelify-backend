# Design System — Backend (tarjeta de Wallet y textos de la API)

Traducción del sistema definido en [`../design-system.md`](../design-system.md)
a las dos superficies que produce el backend. Ese archivo manda.

El backend no tiene UI, pero **sí produce cosas que el usuario ve**:

| Superficie | Dónde | Estado |
|---|---|---|
| La tarjeta en la billetera del cliente | `src/wallet/` | en uso; sin probar en teléfonos |
| Los mensajes de error y el texto de consentimiento | todo `src/` | en uso |

---

## 1. La tarjeta

Es la pieza más visible de todo el producto: lo que el cliente final lleva en el
celular y lo que el negocio muestra como suyo.

**Lleva la marca del negocio, nunca la de Fidelify.** Sale de estos datos:

| Dato | Campo |
|---|---|
| Nombre del negocio | `Business.name` |
| Logo | `Business.logoUrl` |
| Fondo | `Business.colors.background` |
| Texto | `Business.colors.foreground` |
| Etiquetas | `Business.colors.label` |
| Nombre de la tarjeta | `Program.name` |
| Sellos | `Pass.balance` de `Program.stampsRequired` |
| Premio | `Program.rewardText` |
| Código QR | `Pass.serialNumber`, solo, sin URL |

Reglas:

- **Los colores del negocio no se corrigen.** Se usan como vienen.
- Se guardan como hex `#RRGGBB`. Hoy **ningún DTO los valida**: ni el formato ni
  que el texto se lea sobre el fondo. Lo segundo está sin decidir
  ([`../design-system.md`](../design-system.md) §7).
- Si un color falta o no es un hex válido, se usa el de respaldo **solo para
  ese color** (`parseBrandColors`).
- **La tarjeta lleva el nombre del cliente y nada más**: ni teléfono ni correo.
- Fidelify aparece una vez, al reverso: "Tarjeta digital por Fidelify".
- Los textos de la tarjeta se escriben una sola vez, en
  `src/wallet/wallet-pass.ts`, y las dos plataformas dicen lo mismo.
- `Program.design` es un Json sin forma definida. Antes de leerlo o escribirlo
  se le define la forma y se documenta aquí.

---

## 2. Los textos de la API son interfaz

Los dos frontends muestran el `message` de un error **tal como llega**. Lo que
se escribe en una excepción lo lee una cajera con fila de clientes, o un cliente
parado frente al mostrador.

- **En español**, tuteando, sin palabras del código. "Tarjeta no encontrada", no
  "Pass not found".
- **Dicen qué pasó y, si se puede, qué hacer.** "No hay premios disponibles para
  canjear"; "Debes aceptar el uso de tus datos para inscribirte".
- **No revelan de más.** Un negocio inactivo, uno que no existe y uno sin
  programa responden lo mismo: "Negocio no encontrado".
- `class-validator` responde en inglés y con el nombre del campo
  (`name must be longer than…`). Todo campo que llena una persona lleva
  `message` propio en su decorador.
- El vocabulario es el de [`../design-system.md`](../design-system.md) §6:
  tarjeta, sello, premio, canjear, negocio.

### El texto de consentimiento

`CONSENT_TEXT` (`src/public/public.service.ts`) es un texto **con peso legal**:
es lo que el cliente acepta y lo que queda guardado como evidencia. No se edita
por estilo. Un cambio ahí es una decisión de negocio, no de redacción.

---

## 3. Verificación

Para un mensaje nuevo: provocar el error desde la pantalla que lo va a mostrar y
leerlo ahí, no en la respuesta JSON.
