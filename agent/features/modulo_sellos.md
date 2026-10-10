# Módulo Sellos y canjes (caja)

Lo que usa la pantalla de caja del panel: buscar una tarjeta, darle sellos y
canjear un premio. Su contraparte es
`fidelify-backoffice/agent/features/modulo_caja.md`.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/passes/stamp-rules.ts` | Las reglas, como funciones puras |
| `src/passes/stamp-rules.spec.ts` | Sus tests |
| `src/passes/passes.service.ts` | Lee la tarjeta, aplica la regla, guarda saldo y movimiento |
| `src/passes/passes.controller.ts` | Rutas y `StampDto` |
| `src/common/serial.ts` | Genera `serialNumber` y `authToken` |

---

## Modelo

Una tarjeta (`Pass`) lleva dos contadores:

- **`balance`** — sellos acumulados hacia el próximo premio.
- **`rewardsReady`** — premios ya ganados que el cliente todavía no cobra.

Cuántos sellos hacen un premio lo dice `Program.stampsRequired`.

Los dos contadores son independientes: un cliente puede tener un premio
pendiente y seguir juntando sellos para el siguiente.

---

## Reglas

### Dar sellos — `applyStamp(balance, rewardsReady, stampsRequired, count)`

```
total        = balance + count
balance      = total % stampsRequired
rewardsReady = rewardsReady + floor(total / stampsRequired)
rewardEarned = total >= stampsRequired
```

Al completar la tarjeta se gana un premio y el contador **vuelve a empezar**; lo
que sobra se conserva. Varios sellos de golpe pueden dar más de un premio.

| Antes (`balance`, `rewardsReady`) | `stampsRequired` | `count` | Después | `rewardEarned` |
|---|---|---|---|---|
| 3, 0 | 8 | 1 | 4, 0 | no |
| 7, 0 | 8 | 1 | 0, 1 | sí |
| 6, 1 | 4 | 3 | 1, 3 | sí |

Rechaza `stampsRequired < 1` y `count < 1`.

### Canjear — `applyRedeem(rewardsReady)`

Descuenta **un** premio. No toca `balance`. Si `rewardsReady` es 0, falla con
"No hay premios disponibles para canjear", que el servicio devuelve como 400.

### Límites del request

`count` es opcional (1 por defecto), entero, entre 1 y 20.

### Tarjeta anulada

Una tarjeta con `status = VOIDED` se trata como inexistente: 404 "Tarjeta no
encontrada", igual que un código que no existe.

---

## Movimientos

Cada operación inserta un `Transaction` en la misma transacción de base de datos
que actualiza el saldo:

| Operación | `type` | `amount` |
|---|---|---|
| Dar `count` sellos | `STAMP` | `count` |
| Canjear un premio | `REDEEM` | `-1` |

`amount` no está en la misma unidad en los dos casos: en `STAMP` son sellos, en
`REDEEM` son premios.

`staffId` y `branchId` quedan en `null`: el servicio acepta un `staffId`, pero
no hay sesión de la cual sacarlo.

---

## Concurrencia

Dos cajas pueden escanear la misma tarjeta a la vez. Para que un sello no pise
al otro, `commit()` hace un **bloqueo optimista**:

1. Se lee la tarjeta y se calcula el saldo nuevo.
2. Se guarda con `updateMany` condicionado a que `balance` y `rewardsReady`
   **sigan siendo los que se leyeron**.
3. Si no actualizó ninguna fila, alguien más escribió en el medio: se vuelve a
   leer y se recalcula. Hasta 3 intentos.

La lectura va **dentro** del reintento. Reintentar solo la escritura guardaría
un saldo calculado sobre datos viejos.

Si los 3 intentos fallan, el error sube como un 500.

---

## Contrato

Todas las rutas bajo `/api`. Los `POST` responden 201.

### `GET /passes/:serial`

Devuelve la fila del `Pass` con `customer { name, phone }` y
`program { name, stampsRequired, rewardText, businessId }`.

### `POST /passes/:serial/stamp`

Body: `{ "count": 1 }` (opcional).

```json
{
  "serialNumber": "FL-…",
  "balance": 0,
  "stampsRequired": 8,
  "rewardsReady": 1,
  "rewardEarned": true
}
```

### `POST /passes/:serial/redeem`

Sin body. Misma respuesta, sin `rewardEarned`.

### Errores

| Caso | Respuesta |
|---|---|
| Código inexistente o tarjeta anulada | 404 "Tarjeta no encontrada" |
| Canjear sin premios | 400 "No hay premios disponibles para canjear" |
| `count` fuera de 1–20 o no entero | 400 |

---

## El código de la tarjeta

`serialNumber` es `FL-` más 12 caracteres de un alfabeto de 32 que excluye los
que se confunden al leer o dictar (`I`, `O`, `0`, `1`). Siempre en mayúsculas:
el panel pasa a mayúsculas lo que se escribe a mano.

Es lo que lleva el QR de la tarjeta, **solo el código, sin URL**: la caja usa el
texto escaneado directamente como serial.

---

## Sin resolver

- **Autenticación.** Las tres rutas están abiertas. No se sabe quién dio el
  sello ni se valida que la tarjeta sea del negocio que la escanea.
- **`GET /passes/:serial` expone `authToken`**, porque devuelve la fila entera.
- **Cambiar `stampsRequired` con tarjetas en curso.** `balance` se calcula con
  el valor vigente al momento de cada sello. Si el negocio pasa de 8 a 6, una
  tarjeta con 7 sellos queda con un `balance` mayor que el nuevo tope hasta su
  próximo sello, y el saldo deja de poder reconstruirse desde los movimientos.
- **Avisar a la billetera.** Tras un sello, la tarjeta en el celular no se
  entera. Depende de `modulo_wallet.md`.
- **`ADJUST`.** El tipo existe; ningún endpoint lo usa.
