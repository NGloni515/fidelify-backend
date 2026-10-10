# Módulo Wallet

Entregar la tarjeta a la billetera del celular —Apple Wallet y Google Wallet— y
mantenerla al día después de cada sello.

> **Probado solo con llaves de prueba.** Los tests firman con un certificado
> autofirmado y una llave RSA generada al vuelo, y simulan a Google y a APNs.
> Ninguna tarjeta se ha instalado todavía en un teléfono real: la primera vez
> que haya credenciales verdaderas se prueba en un iPhone y en un Android.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/wallet/wallet.controller.ts` | Los dos enlaces que abre el cliente |
| `src/wallet/wallet-pass.ts` | `WalletPass`: lo que la tarjeta muestra, y sus textos |
| `src/wallet/wallet-pass.service.ts` | Carga un `WalletPass` de la base |
| `src/wallet/wallet-notifier.service.ts` | Avisa a las dos billeteras tras un sello o un canje |
| `src/wallet/secrets.ts` | `readSecret()`: lee un certificado o una llave de una variable |
| `src/wallet/google/google-pass.ts` | Arma la clase y el objeto de Google (puro) |
| `src/wallet/google/google-wallet.service.ts` | Firma el enlace de guardado; actualiza por REST |
| `src/wallet/apple/apple-pass.ts` | Arma los campos del pase de Apple (puro) |
| `src/wallet/apple/apple-wallet.service.ts` | Firma el `.pkpass`; pide los push |
| `src/wallet/apple/apple-web-service.controller.ts` | El web service que llama Apple Wallet |
| `src/wallet/apple/apns-client.ts` | El push a APNs, por HTTP/2 |
| `src/wallet/apple/default-icon.ts` | Ícono de respaldo, embebido |
| `test/wallet.e2e-spec.ts` | Todo lo anterior, con llaves de prueba |

---

## Sin credenciales no se rompe nada

Cada plataforma se activa sola cuando tiene **todas** sus variables. Mientras
falte alguna:

- su enlace responde 501 "… todavía no está configurado";
- dar sellos y canjear funcionan igual: el aviso a esa billetera se omite.

Las dos son independientes: puede estar Google y no Apple.

---

## Los dos enlaces

| Ruta | Qué hace |
|---|---|
| `GET /api/wallet/apple/:serial` | Devuelve el `.pkpass` firmado (`application/vnd.apple.pkpass`) |
| `GET /api/wallet/google/:serial` | Redirige (302) al enlace de guardado de Google |

**Estas rutas son un contrato.** La inscripción las devuelve como
`appleWalletUrl` y `googleWalletUrl`, y la página pública las pone tal cual en
dos enlaces. Las abre el navegador del cliente con una navegación normal: sin
cabeceras, sin token, sin sesión. Lo único que identifica la tarjeta es el
serial en la URL.

Una tarjeta inexistente, anulada o de un negocio inactivo responde 404.

---

## Qué lleva la tarjeta

Las dos plataformas muestran lo mismo, tomado de `WalletPass`:

| En la tarjeta | Sale de |
|---|---|
| Nombre del negocio | `Business.name` |
| Colores | `Business.colors`; si falta o está mal formado alguno, el respaldo |
| Logo | `Business.logoUrl`, si existe |
| Nombre de la tarjeta | `Program.name` |
| Cliente | `Customer.name` |
| Sellos | "3 de 8" |
| Premios | "Ninguno todavía" · "1 por canjear" · "2 por canjear" |
| Al completar | `Program.rewardText` |
| Código QR | `Pass.serialNumber`, **solo**, sin URL |

**Nunca lleva el teléfono ni el correo del cliente.**

---

## Google Wallet

Un pase **genérico**: una clase por programa y un objeto por tarjeta.

| Id | Forma |
|---|---|
| Clase | `<issuerId>.fidelify_program_<programId>` |
| Objeto | `<issuerId>.fidelify_pass_<passId>` |

### Guardar

El enlace es `https://pay.google.com/gp/v/save/<jwt>`. El JWT va firmado con la
llave de la cuenta de servicio (RS256) y **lleva adentro la clase y el objeto
completos**: Google los crea cuando el cliente guarda la tarjeta. No se llama a
la API al inscribir, y no queda nada creado por enlaces que nadie abrió.

### Actualizar

Tras un sello o un canje, `PATCH …/genericobject/<id>` con los textos nuevos.

- **404 es normal**: el cliente nunca guardó la tarjeta en Google. Se ignora.
- Si completó la tarjeta, además `POST …/addMessage` con
  `messageType: TEXT_AND_NOTIFY`, que es lo que le hace sonar el celular.

El token de acceso se pide con la cuenta de servicio y se guarda en memoria
hasta un minuto antes de vencer.

---

## Apple Wallet

Un pase `storeCard` firmado con `passkit-generator`.

| Campo | Contenido |
|---|---|
| Cabecera | Sellos |
| Principal | Al completar |
| Secundarios | Cliente · Premios |
| Reverso | Cómo funciona · Código de la tarjeta · "Tarjeta digital por Fidelify" |

Sellos y premios llevan `changeMessage`: es el texto que iOS muestra en la
pantalla bloqueada cuando ese valor cambia.

El ícono es obligatorio para Apple. Se usa uno de respaldo; el logo del negocio
se baja de `Business.logoUrl` **solo si es PNG y responde en 3 segundos**. Un
logo roto o lento no impide que el cliente reciba su tarjeta.

### Actualizar

Apple no recibe el contenido nuevo: recibe un push vacío y **vuelve a pedir el
pase**. Para eso el pase lleva `webServiceURL` y `authenticationToken`
(`Pass.authToken`), y Apple Wallet llama por su cuenta a estas rutas, todas bajo
`/api/wallet/apple/v1`:

| Ruta | Para |
|---|---|
| `POST devices/:device/registrations/:passType/:serial` | El dispositivo se anota para recibir avisos de esa tarjeta |
| `GET devices/:device/registrations/:passType?passesUpdatedSince=` | Qué tarjetas de ese dispositivo cambiaron |
| `GET passes/:passType/:serial` | El pase al día (o 304 si no cambió) |
| `DELETE devices/:device/registrations/:passType/:serial` | El cliente borró la tarjeta |
| `POST log` | Errores que reporta el dispositivo; van al log |

Las rutas, los códigos de respuesta y la cabecera `Authorization: ApplePass
<token>` **los define Apple**, no las convenciones de esta API.

- Las que tocan una tarjeta exigen el `authToken` de **esa** tarjeta.
- `passesUpdatedSince` y `lastUpdated` son el `updatedAt` de la tarjeta en
  milisegundos.
- **`webServiceURL` solo se incluye si `PUBLIC_API_URL` es `https://`.** Sin
  eso la tarjeta se instala pero queda congelada con el saldo del día en que se
  bajó.
- Si APNs responde 410, ese dispositivo ya no tiene la tarjeta: se borra su
  registro.

---

## El aviso tras un sello

`PassesService` llama a `WalletNotifierService.passChanged()` después de guardar
el sello o el canje.

- **Nunca falla y nunca tarda más de 4 segundos.** El sello ya está guardado y
  hay una cajera esperando: si Google o Apple no responden, se registra el error
  y se sigue.
- **Se espera, no se lanza en segundo plano.** En un hosting serverless el
  proceso puede congelarse apenas sale la respuesta, y el aviso se perdería.

---

## Variables

| Variable | Qué |
|---|---|
| `PUBLIC_API_URL` | URL pública `https://` de esta API |
| `GOOGLE_WALLET_ISSUER_ID` | Id del issuer en la consola de Google Pay & Wallet |
| `GOOGLE_WALLET_SERVICE_ACCOUNT` | El JSON de la cuenta de servicio |
| `APPLE_PASS_TYPE_ID` | El Pass Type ID (`pass.…`) |
| `APPLE_TEAM_ID` | El Team ID de la cuenta de Apple Developer |
| `APPLE_PASS_CERT` | Certificado del Pass Type ID, en PEM |
| `APPLE_PASS_KEY` | Su llave privada, en PEM |
| `APPLE_PASS_KEY_PASSPHRASE` | Solo si la llave tiene contraseña |
| `APPLE_WWDR_CERT` | Certificado intermedio WWDR de Apple, en PEM |

Los secretos aceptan tres formas (`readSecret`): **la ruta de un archivo**, el
valor tal cual, o su **base64**. En local se usan rutas dentro de `secrets/`,
que está en `.gitignore`. En un hosting se usa base64, porque los paneles de
variables suelen romper los saltos de línea de un PEM.

---

## Sin resolver

- **Probar en teléfonos reales.** Sobre todo el push de Apple: se manda sin la
  cabecera `apns-push-type`, y eso no se pudo comprobar contra APNs.
- **Modo demo de Google.** Una cuenta de issuer nueva solo deja guardar
  tarjetas a sus administradores y a las cuentas de prueba. Para clientes
  reales hay que pedir acceso de publicación.
- **Dónde se aloja el logo.** `Business.logoUrl` tiene que ser una URL pública;
  no hay subida de imágenes.
- **Los sellos son texto.** No hay una imagen con los círculos llenos.
- **Cambios de marca.** Si el negocio cambia sus colores o su nombre, en Apple
  las tarjetas ya guardadas se enteran recién en su próximo sello; en Google no
  se enteran, porque la actualización solo manda los textos del saldo.
- **Un botón por plataforma.** La página pública muestra los dos a cualquier
  celular.
