# Módulo Clientes

El dueño ve a los clientes de su negocio: los busca, abre la ficha de uno y lee
el historial de su tarjeta. Su contraparte es
`fidelify-backoffice/agent/features/modulo_clientes.md`.

El ajuste manual de sellos que se hace desde la ficha vive con el resto de las
reglas de sellos, en [`modulo_sellos`](modulo_sellos.md).

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/customers/customers.controller.ts` | Rutas bajo `/customers`, detrás de `StaffAuthGuard` y `OwnerGuard` |
| `src/customers/customers.service.ts` | Búsqueda paginada y ficha, acotadas al negocio de la sesión |
| `src/customers/dto/search-customers.dto.ts` | Validación de la búsqueda |
| `test/customers.e2e-spec.ts` | Roles, búsqueda, páginas y aislamiento entre negocios |

---

## Reglas

- **Solo el dueño.** La lista lleva el teléfono de cada cliente: es un dato
  personal (LOPDP) y la cajera no lo necesita para atender. Ella ve a un solo
  cliente, el de la tarjeta que escanea (`GET /passes/:serial`).
- **La búsqueda va en el body**, por `POST`, aunque solo lee: lo que se busca
  puede ser un teléfono, y en la URL quedaría en los logs de cada proxy.
- **Se busca por nombre** (sin distinguir mayúsculas), **por teléfono** (las
  cifras de lo escrito, desde 3) **o por código de tarjeta**, todo con
  "contiene". Con menos de 3 cifras no se compara el teléfono: casi todos
  empiezan con `09`.
- **Páginas de 50**, por nombre. La respuesta trae `total` y `pageSize` para
  que el panel arme la paginación.
- **Última visita** es el último sello o canje. Un ajuste no cuenta: lo hace el
  dueño, no es el cliente volviendo.
- Solo se muestran tarjetas activas. Una anulada no existe para la caja ni
  aquí.
- La ficha trae los **últimos 100 movimientos** de cada tarjeta, el más nuevo
  primero, con el nombre de quien los hizo.
- **Nunca sale `authToken`**, ni `consentText`: de la evidencia de
  consentimiento la pantalla solo muestra la fecha.

---

## Contrato

Todas bajo `/api/customers`, con `Authorization: Bearer …` de un dueño.

### `POST /search`

Body: `{ "query"?: "…", "page"?: 1 }`, los dos opcionales. 200.

```json
{
  "total": 56,
  "page": 1,
  "pageSize": 50,
  "customers": [
    {
      "id": "…",
      "name": "Ana Torres",
      "phone": "0990000001",
      "joinedAt": "2026-10-01T15:00:00.000Z",
      "lastVisitAt": "2026-10-05T15:00:00.000Z",
      "passes": [
        { "serialNumber": "FL-…", "balance": 2, "rewardsReady": 0, "stampsRequired": 8 }
      ]
    }
  ]
}
```

`lastVisitAt` es `null` si nunca volvió después de inscribirse.

### `GET /:id`

```json
{
  "id": "…",
  "name": "Ana Torres",
  "phone": "0990000001",
  "email": null,
  "birthDate": "1990-03-07",
  "joinedAt": "…",
  "consentAt": "…",
  "passes": [
    {
      "serialNumber": "FL-…",
      "balance": 2,
      "rewardsReady": 0,
      "program": { "name": "Tarjeta de sellos", "stampsRequired": 8, "rewardText": "1 helado gratis" },
      "movements": [
        { "type": "ADJUST", "amount": -1, "note": "Sello de más", "at": "…", "staffName": "Dueña" },
        { "type": "STAMP", "amount": 2, "note": null, "at": "…", "staffName": "Caja" }
      ]
    }
  ]
}
```

`birthDate` va como `YYYY-MM-DD`, sin hora: es una fecha de calendario, y como
instante cualquier zona horaria detrás de UTC la mostraría un día antes.
`staffName` es `null` si quien hizo el movimiento ya no existe.

### Errores

| Caso | Respuesta |
|---|---|
| Sin sesión | 401 |
| Quien pregunta es cajera | 403 "Solo el dueño del negocio puede hacer esto" |
| Cliente de otro negocio, o que no existe | 404 "Cliente no encontrado" |
| Un campo que el DTO no declara | 400 |

---

## Sin resolver

- **Las tildes cuentan en la búsqueda**: "maria" no encuentra a "María".
  Arreglarlo pide la extensión `unaccent` de Postgres.
- **Ordenar por otra cosa que el nombre**, como la última visita. Hoy exigiría
  calcularla en la consulta o guardarla en el cliente.
- **Editar o borrar un cliente**, incluido el derecho a pedir que se eliminen
  sus datos que promete el texto de consentimiento.
