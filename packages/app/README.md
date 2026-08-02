# @nexosoft/app

**Capa de aplicación**: los casos de uso del negocio, orquestando
`@nexosoft/domain` sobre **puertos de persistencia** (interfaces). No depende de
ningún framework (ni Tauri ni NestJS): la base de datos concreta es un detalle que
aportan los adaptadores.

```
  UI (POS Tauri / panel web)          ← Fase 1.4b
        │  llama casos de uso
        ▼
  @nexosoft/app  (ServicioDeVenta, puertos)   ← este paquete
        │  depende de contratos (Repositorios)
        ▼
  Adaptadores: en memoria (tests) · SQLite (Tauri) · PostgreSQL (backend)
        │  usa reglas de
        ▼
  @nexosoft/domain  (dinero, IVA, comprobantes, stock)
```

## Contenido (Fase 1.4a)

| Módulo                             | Qué expone                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `config/configuracion-comercio.ts` | `ConfiguracionComercio`: condición fiscal del emisor, punto de venta, depósito/lista por defecto, políticas y `emiteComprobantesFiscales` (Fase 10.1: `false` = comercio sin alta en ARCA, vende con `TicketNoFiscal` — ADR-0041). |
| `puertos/repositorios.ts`          | Interfaces `RepositorioArticulos/Precios/Existencias/Movimientos/Ventas` y `Repositorios`.                    |
| `memoria/repositorios-memoria.ts`  | Adaptadores **en memoria** + `crearRepositoriosMemoria(semilla)` para tests.                                  |
| `ventas/servicio-venta.ts`         | `ServicioDeVenta`: `previsualizarVenta` (totales) y `confirmarVenta` (persiste + descuenta stock).            |
| `ventas/venta.ts`                  | `VentaConfirmada` e `ItemVenta` (lo que se persiste).                                                         |
| `sql/esquema-sqlite.sql`           | Esquema SQLite del POS (dinero en centavos, cantidades en texto). Lo implementa el adaptador en 1.4b.         |

## El caso de uso `confirmarVenta`

1. Resuelve cada ítem contra el **catálogo** (artículo + precio de lista) y valida
   unidad de medida (un artículo "por unidad" no admite cantidad fraccionada).
2. Determina el **tipo de comprobante** (emisor × receptor) y calcula totales con
   `@nexosoft/domain` (IVA discriminado según la letra).
3. Calcula el **cobro** (pago combinado, vuelto). Exige que la venta quede
   cancelada (cuenta corriente llega en otra fase).
4. Valida **stock** (configurable: bloquear o permitir sobreventa).
5. Persiste la venta en estado `PENDIENTE_CAE` y **descuenta el stock** con un
   movimiento por ítem.

> **Atomicidad**: en memoria los pasos se aplican en orden. El adaptador SQLite
> (1.4b) debe envolver `confirmarVenta` en una transacción.

## Adaptador SQLite (Fase 1.4b — persistencia, ADR-0017)

El POS persiste en SQLite, pero esa base solo corre dentro de Tauri. Para escribir
el SQL una vez y **testearlo sin Tauri**, los repositorios dependen de un puerto
`EjecutorSql`:

| Módulo                          | Qué expone                                                                 |
| ------------------------------- | -------------------------------------------------------------------------- |
| `sqlite/ejecutor-sql.ts`        | `EjecutorSql` (`ejecutar` / `consultar`) — el contrato de acceso a SQLite. |
| `sqlite/esquema.ts`             | Esquema ejecutable + `crearEsquema(ejecutor)`.                             |
| `sqlite/mapeo.ts`               | Conversión fila ↔ dominio (centavos ↔ `Money`, texto ↔ `Cantidad`, etc.).  |
| `sqlite/repositorios-sqlite.ts` | Repositorios SQLite + `crearRepositoriosSqlite(ejecutor)`.                 |

- En producción (POS) el `EjecutorSql` se implementa sobre `@tauri-apps/plugin-sql`.
- En los tests, sobre **`node:sqlite`** (SQLite real, sin Tauri) — valida esquema y
  queries de verdad (round-trip de catálogo y `ServicioDeVenta` persistiendo).

## Comandos

```bash
pnpm --filter @nexosoft/app test       # vitest (flujo completo con repos en memoria)
pnpm --filter @nexosoft/app typecheck   # tsc --noEmit
pnpm --filter @nexosoft/app lint        # eslint
```

> Estado: **Fase 1.4a + adaptador SQLite implementados** (15 tests; 4 contra SQLite
> real vía `node:sqlite`). Falta de **1.4b**: la **UI del POS en React/Tauri** y el
> `EjecutorSql` sobre `plugin-sql` — requiere instalar los **VS C++ Build Tools**.
