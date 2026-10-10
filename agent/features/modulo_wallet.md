# Módulo Wallet

Entregar la tarjeta a la billetera del celular: Apple Wallet y Google Wallet.

> **Sin implementar.** Los dos endpoints existen y responden 501. Este documento
> describe lo que ya está fijado —las rutas y el modelo de datos— para que la
> implementación no lo rompa.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/wallet/wallet.controller.ts` | Las dos rutas. Registrado directo en `AppModule`: no hay `WalletModule` |

---

## Rutas

| Ruta | Hoy |
|---|---|
| `GET /api/wallet/apple/:serial` | 501 "Apple Wallet todavía no está configurado" |
| `GET /api/wallet/google/:serial` | 501 "Google Wallet todavía no está configurado" |

**Estas rutas ya son un contrato.** La inscripción las devuelve como
`appleWalletUrl` y `googleWalletUrl`, y la página pública las pone tal cual en
dos enlaces. Las abre el navegador del cliente con una navegación normal: sin
cabeceras, sin token, sin sesión. Lo único que identifica la tarjeta es el
serial en la URL.

---

## Lo que el modelo ya reserva

| Campo | Para |
|---|---|
| `Pass.serialNumber` | identifica la tarjeta; es el contenido de su QR |
| `Pass.authToken` | secreto por tarjeta con el que Apple Wallet se autentica al pedir actualizaciones. Se genera al inscribir |
| `Pass.platform` | `APPLE` \| `GOOGLE`: dónde la guardó el cliente |
| `Pass.googleObjectId` | id del objeto en Google Wallet |
| `AppleDeviceRegistration` | dispositivos que pidieron recibir actualizaciones de una tarjeta |
| `Business.logoUrl`, `Business.colors` | marca del negocio en la tarjeta |
| `Program.design` | textos e imágenes de la tarjeta. Json sin forma definida |

---

## Lo que tiene que cumplir la implementación

- **El QR de la tarjeta lleva solo el `serialNumber`**, sin URL alrededor. La
  pantalla de caja usa el texto escaneado directamente como serial.
- **La tarjeta lleva la marca del negocio**, no la de Fidelify. Ver
  `design-system.md`.
- **La tarjeta refleja el saldo.** `PassesService.stamp()` es el punto donde hay
  que avisar a la billetera después de un sello; hoy no avisa a nadie.
- **Completar la tarjeta le avisa al cliente** en el celular. Es parte de lo que
  se le promete al negocio.
- Los certificados y llaves de firma son secretos: entran por variables de
  entorno, declaradas en `src/config/env.validation.ts`. Nunca al repo.

---

## Lo que hace falta de afuera

Ninguna de las dos se puede empezar sin esto:

| Plataforma | Requisito |
|---|---|
| Apple Wallet | Cuenta de Apple Developer, un Pass Type ID y su certificado de firma |
| Google Wallet | Cuenta de issuer de Google Wallet y una cuenta de servicio en Google Cloud |
