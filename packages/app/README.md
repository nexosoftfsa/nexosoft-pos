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
| `config/configuracion-comercio.ts` | `ConfiguracionComercio`: condición fiscal del emisor, punto de venta, depósito/lista por defecto y políticas. |
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

## Comandos

```bash
pnpm --filter @nexosoft/app test       # vitest (flujo completo con repos en memoria)
pnpm --filter @nexosoft/app typecheck   # tsc --noEmit
pnpm --filter @nexosoft/app lint        # eslint
```

> Estado: **Fase 1.4a implementada** (11 tests). Próximo: **1.4b** — adaptador
> SQLite (Tauri) y UI del POS en React. Requiere instalar los VS C++ Build Tools.
