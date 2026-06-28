# Módulo `reportes`

Reportes agregados para el **panel del dueño** ([ADR-0024](../../../../docs/adr/0024-panel-web-de-reportes.md)).
Solo lectura. Scopeados por la `sucursalId` del token y restringidos a roles
**ADMIN/SUPERVISOR** (`JwtAuthGuard` + `RolesGuard`).

Las ventas que cuentan son únicamente las de estado **`COMPLETADA`**
(se excluyen `ANULADA` y `PENDIENTE`). El dinero viaja como string con 2 decimales
(`Decimal.toFixed(2)`) para no perder exactitud.

## Endpoints

Todos bajo `/api/v1/reportes`. Requieren `Authorization: Bearer <token>` de un
usuario ADMIN o SUPERVISOR.

| Método y ruta | Query | Devuelve |
| ------------- | ----- | -------- |
| `GET /ventas/resumen` | `desde?`, `hasta?` | KPIs: `cantidadVentas`, `totalVendido`, `totalDescuentos`, `ticketPromedio` |
| `GET /ventas/serie` | `desde?`, `hasta?` | Serie diaria: `[{ fecha, total, cantidad }]` |
| `GET /ventas/por-medio-pago` | `desde?`, `hasta?` | `[{ medioPago, total, cantidad }]` (desc. por total) |
| `GET /ventas/por-terminal` | `desde?`, `hasta?` | `[{ terminalId, nombre, total, cantidad }]` (desc. por total) |
| `GET /productos/top` | `desde?`, `hasta?`, `limite?` (1–100, def. 10) | Top productos: `[{ productoId, nombre, codigo, cantidad, monto }]` (desc. por cantidad) |
| `GET /stock/bajo` | `umbral?` (≥0, def. 5) | Productos con saldo ≤ umbral: `[{ producto, saldo }]` (asc. por saldo) |
| `GET /libro-ventas` | — | Descarga el **libro de ventas Excel** (`ventas.xlsx`) que genera el `VentasModule` (ADR-0021). 404 si todavía no hay ventas. |

### Rango de fechas

- Formato `YYYY-MM-DD`, interpretado en **UTC**.
- `hasta` es **inclusive** (abarca todo ese día).
- Sin parámetros: **últimos 30 días** hasta hoy inclusive.

## Diseño

La agregación se hace **en memoria con `Decimal`** (se traen las filas del rango y
se reducen), igual que `StockService`. Es simple de testear sin base real y
consistente con el resto del backend. Para volúmenes muy grandes habría que mover
la agregación a SQL (`groupBy`/vistas) — ver ADR-0024.

## Tests

`reportes.service.spec.ts` cubre agregación con dinero exacto, ticket promedio sin
división por cero, agrupaciones (día / medio de pago / terminal), top con límite,
stock bajo por umbral, y el cálculo del rango (filtro `COMPLETADA`, `hasta`
inclusive, default 30 días). El `RolesGuard` se prueba en
`auth/roles.guard.spec.ts`.

```bash
corepack pnpm --filter @nexosoft/cloud-api test
```
