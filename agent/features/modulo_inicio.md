# Módulo Inicio

El resumen que ve el dueño al entrar al panel: cuántos clientes tiene, cuántos
sellos y canjes hubo, quiénes vienen más y quiénes dejaron de venir. Su
contraparte es `fidelify-backoffice/agent/features/modulo_inicio.md`.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/dashboard/dashboard-rules.ts` | Reglas puras: el día local, la medianoche local y el ranking de visitas |
| `src/dashboard/dashboard-rules.spec.ts` | Sus tests |
| `src/dashboard/dashboard.service.ts` | Lee los conteos y arma el resumen |
| `src/dashboard/dashboard.controller.ts` | `GET /dashboard`, detrás de `StaffAuthGuard` y `OwnerGuard` |
| `test/dashboard.e2e-spec.ts` | Roles, números de un escenario armado a mano y aislamiento |

---

## Definiciones

Todo se mide sobre **los últimos 30 días** (`periodDays`), contados hacia atrás
desde ahora, y **en hora de Ecuador** (`America/Guayaquil`). `Business` no tiene
zona horaria propia: todos los negocios están en Ecuador.

| Dato | Qué cuenta |
|---|---|
| `customers.total` | Clientes del negocio |
| `customers.newInPeriod` | Inscritos en los últimos 30 días |
| `customers.lapsed` | Los que **dejaron de venir** (ver abajo) |
| `today.stamps` | Suma de sellos dados desde la medianoche local. Un ajuste no cuenta |
| `today.rewardsRedeemed` | Canjes desde la medianoche local |
| `period.stamps`, `period.rewardsRedeemed` | Lo mismo, en los últimos 30 días |
| `rewardsPending` | Premios ganados y sin canjear, sumando las tarjetas activas |

- **Una visita es un día**, no un movimiento: un sello y un canje en la misma
  tarde son una visita. Cuentan los sellos y los canjes; los ajustes no, porque
  los hace el dueño y no son el cliente volviendo.
- **Quiénes vienen más**: los 5 con más días de visita en el periodo; a igual
  cantidad, el que vino más recientemente.
- **Dejó de venir** quien se inscribió hace más de 30 días y no tiene ni un
  sello ni un canje en los últimos 30, sea porque dejó de venir o porque nunca
  volvió después de inscribirse. Se listan 10, los que dejaron de venir hace
  menos primero: son los más fáciles de recuperar. `customers.lapsed` es el
  total.
- Las tarjetas anuladas no cuentan, ni para visitas ni para premios.

El panel no escribe "30" en ningún lado: lo lee de `periodDays`.

---

## Contrato

`GET /api/dashboard`, con `Authorization: Bearer …` de un dueño. 200:

```json
{
  "periodDays": 30,
  "customers": { "total": 7, "newInPeriod": 3, "lapsed": 1 },
  "today": { "stamps": 4, "rewardsRedeemed": 1 },
  "period": { "stamps": 29, "rewardsRedeemed": 2 },
  "rewardsPending": 2,
  "topCustomers": [
    { "id": "…", "name": "Andrés Salazar", "visits": 12, "lastVisitAt": "…" }
  ],
  "lapsedCustomers": [
    { "id": "…", "name": "Pedro Cevallos", "joinedAt": "…", "lastVisitAt": "…" }
  ]
}
```

`lastVisitAt` de un cliente que dejó de venir es `null` si nunca volvió después
de inscribirse. Ni teléfonos ni correos: el panel lleva a la ficha por el `id`.

| Caso | Respuesta |
|---|---|
| Sin sesión | 401 |
| Quien pregunta es cajera | 403 "Solo el dueño del negocio puede hacer esto" |

---

## Cómo se calcula

Los conteos son consultas de Prisma (`count`, `aggregate`). Las visitas y los
clientes que dejaron de venir se traen y se ordenan en el servicio, porque
agruparlas por día local en SQL pide aritmética de zonas horarias sobre
columnas sin zona.

**Límite conocido**: se leen todos los sellos y canjes de 30 días, y todos los
clientes que dejaron de venir. Para una heladería son cientos; con miles por
negocio conviene pasarlo a SQL.

---

## Sin resolver

- **Que el dueño elija el periodo** o el umbral de "dejó de venir".
- **Comparar con el periodo anterior** ("+12 % que el mes pasado").
- **Zona horaria por negocio**, el día que haya uno fuera de Ecuador.
