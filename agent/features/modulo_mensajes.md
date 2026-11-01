# Módulo Mensajes

El dueño le escribe al celular de sus clientes: a todos o a un grupo. El
mensaje llega por la tarjeta que ya tienen en la billetera, sin aplicación ni
SMS. Su contraparte es `fidelify-backoffice/agent/features/modulo_mensajes.md`.

En el código, un mensaje es una `Notification`.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/notifications/notification-rules.ts` | Reglas puras: el freno de envíos y cómo se dice la espera |
| `src/notifications/notification-rules.spec.ts` | Sus tests |
| `src/notifications/notifications.service.ts` | Los grupos, el freno, el envío y el historial |
| `src/notifications/notifications.controller.ts` | `GET` y `POST /notifications`, detrás de `StaffAuthGuard` y `OwnerGuard` |
| `src/notifications/dto/send-notification.dto.ts` | Validación del mensaje y del grupo |
| `src/dashboard/lapsed-customers.ts` | Quién dejó de venir, la misma definición del Inicio |
| `test/notifications.e2e-spec.ts` | Roles, grupos, freno, envíos simultáneos, validación y aislamiento |
| `test/wallet.e2e-spec.ts` | Que el mensaje llegue a Google y a Apple |

---

## A quién

| `audience` | Quiénes |
|---|---|
| `ALL` | Todos los clientes |
| `LAPSED` | Los que **dejaron de venir**, igual que en el Inicio ([`modulo_inicio`](modulo_inicio.md)) |
| `ONE_STAMP_LEFT` | Los que tienen una tarjeta a un sello del premio |

Se cuentan clientes, no tarjetas, y solo los que tienen una tarjeta activa. El
mensaje se escribe en las tarjetas activas del grupo; con `ONE_STAMP_LEFT`, solo
en la que está a un sello.

---

## El freno

Un mensaje de más se siente como spam, y el cliente borra la tarjeta. Por eso
hay un tope **por negocio**: **uno por día y dos por semana**, en ventanas
móviles (24 horas y 7 días hacia atrás desde ahora).

- **Lo hace cumplir el backend.** El panel muestra cuándo se puede enviar el
  siguiente (`nextAvailableAt`), pero pasado el tope responde 429 aunque el
  panel no lo frene.
- **Google pone su propio tope**: tres notificaciones por tarjeta cada 24 horas,
  contando el aviso de premio. El de Fidelify queda por debajo.
- **Dos envíos a la vez no pasan los dos.** El chequeo y el guardado van en una
  transacción `Serializable`: Postgres aborta una, y al reintentarla ya ve el
  mensaje de la otra. Un sello que cae en una de las tarjetas a mitad del envío
  también la aborta, y el reintento sigue. Tras tres intentos, 409.
- **Un grupo vacío no gasta el tope**: responde 400 antes de guardar nada.

---

## Cómo llega

1. Se guarda la `Notification` y el texto en `Pass.lastMessage` de cada tarjeta
   del grupo, en la misma transacción.
2. Se avisa a las billeteras ([`modulo_wallet`](modulo_wallet.md)):
   - **Google**: `addMessage` en cada tarjeta guardada, de 10 en 10.
   - **Apple**: un push a cada iPhone que tiene la tarjeta. El teléfono la vuelve
     a pedir, y el reverso trae el mensaje nuevo con `changeMessage`: eso es lo
     que suena en la pantalla bloqueada.
3. `reached` cuenta los clientes cuya tarjeta lo recibió en al menos una
   billetera.

**Solo le llega a quien guardó la tarjeta en el celular.** Un cliente que se
inscribió y nunca la agregó a Wallet cuenta en `audienceSize`, no en
`reached`. Sin credenciales de una plataforma, esa plataforma no suma.

El envío ocurre dentro de la petición y el panel espera el resultado. No tiene
tope de tiempo total: cada llamada a Google tiene el suyo (10 segundos).

---

## Contrato

Todas bajo `/api/notifications`, con `Authorization: Bearer …` de un dueño.

### `GET /`

```json
{
  "maxLength": 120,
  "limits": { "perDay": 1, "perWeek": 2 },
  "nextAvailableAt": "2026-11-02T15:00:00.000Z",
  "audiences": [
    { "audience": "ALL", "size": 40 },
    { "audience": "LAPSED", "size": 5 },
    { "audience": "ONE_STAMP_LEFT", "size": 3 }
  ],
  "history": [
    {
      "id": "…",
      "message": "Hoy 2x1 en conos",
      "audience": "ALL",
      "audienceSize": 40,
      "reached": 12,
      "sentAt": "2026-11-01T15:00:00.000Z"
    }
  ]
}
```

`nextAvailableAt` es `null` si se puede enviar ya. `history` trae los últimos
20, el más nuevo primero.

### `POST /`

Body: `{ "message": "Hoy 2x1 en conos", "audience": "ALL" }`. El mensaje se
recorta y va de 1 a 120 caracteres. 201, con el mismo objeto de `history`.

### Errores

| Caso | Respuesta |
|---|---|
| Sin sesión | 401 |
| Quien pregunta es cajera | 403 "Solo el dueño del negocio puede hacer esto" |
| Mensaje vacío o de más de 120 caracteres, o un grupo que no existe | 400, con el motivo |
| Nadie en el grupo | 400 "No hay clientes en ese grupo." |
| Pasado el tope | 429 "Ya llegaste al límite de mensajes. Puedes enviar el próximo en 18 horas." |
| Tres choques seguidos con otro envío o con sellos | 409 "No se pudo enviar el mensaje. Vuelve a intentarlo." |
| Un campo que el DTO no declara | 400 |

---

## Sin resolver

- **Apple no suena si el texto es igual al anterior**: `changeMessage` salta
  cuando el valor cambia. Dos "Hoy 2x1 en conos" seguidos llegan en silencio.
- **Con miles de tarjetas el envío tarda**, porque va dentro de la petición.
  Ahí hace falta una cola.
- **No se reintenta lo que no llegó.** Si Google o Apple fallan a mitad del
  envío, esas tarjetas se quedan sin el mensaje, y el tope ya se gastó.
- **Programar un mensaje** para otro día u hora.
