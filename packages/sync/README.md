# @nexosoft/sync

Capa de sincronización **offline-first** entre el POS y el servidor de sucursal.
Implementa la **cola de operaciones (outbox)** del
[ADR-0005](../../docs/adr/0005-sincronizacion-offline-first.md).

## Idea

Cada acción que debe llegar al servidor (hoy: **ventas**) se **encola
localmente** con un `operacionId` único. Cuando hay red, el motor sube las
pendientes; el servidor es **idempotente** (reenviar es seguro). Las cajas
siguen vendiendo aunque el servidor esté caído.

```
  Venta en la caja
        │
        ▼
  encolar(operacion)  ──►  [ cola: pendiente ]
                                  │  sincronizar() (cuando hay red)
                                  ▼
                          ClienteDeSync.enviar() ──HTTP──► POST /sync/operaciones
                                  │
                   ┌──────────────┼───────────────┐
                   ▼              ▼                ▼
              completada      pendiente         fallida
                            (reintenta)     (agotó intentos)
```

## Piezas (puertos + adaptadores)

| Pieza | Rol |
| --- | --- |
| `OperacionSync` / `OperacionEnCola` | La operación y su estado en la cola |
| `AlmacenDeOperaciones` (puerto) | Persistencia de la cola. En el POS: SQLite |
| `AlmacenEnMemoria` | Adaptador para tests/dev |
| `ClienteDeSync` (puerto) | Transporte al servidor. En el POS: HTTP |
| `MotorDeSincronizacion` | Encola, envía por lotes, reintenta, marca estados |

## Estados de una operación

`pendiente` → `enviando` → `completada` | `fallida`

- **reintentable** (timeout, sin red, 5xx): vuelve a `pendiente`, suma intento;
  al superar `maxIntentos` pasa a `fallida`.
- **no reintentable** (payload inválido, 4xx): `fallida` de inmediato.

La **resolución de conflictos por agregado** (stock como delta, comprobantes
inmutables, catálogo autoritativo del backend) vive en el servidor — ver
ADR-0005. Esta cola garantiza el envío ordenado e idempotente.

## Uso

```ts
import { MotorDeSincronizacion, AlmacenEnMemoria } from "@nexosoft/sync";

const motor = new MotorDeSincronizacion(almacen, cliente, { maxIntentos: 5, loteTam: 50 });

await motor.encolar({
  operacionId: crypto.randomUUID(),
  tipo: "venta",
  payload: cuerpoDeLaVenta,
  terminalId: "caja-1",
  creadaEn: new Date().toISOString(),
});

const resumen = await motor.sincronizar();
// { enviadas, completadas, fallidas, pendientes }
```

## Qué falta (Fase 4.6)

- **Adaptador SQLite** de `AlmacenDeOperaciones` en el POS (la cola persiste a
  cierres/cortes de luz).
- **Adaptador HTTP** de `ClienteDeSync` contra el servidor de sucursal.
- **Indicador de estado de sync** en la UI del POS.
- **Pull** del servidor (catálogo/precios autoritativos) — hoy sólo push.

## Tests

`pnpm --filter @nexosoft/sync test` — 10 tests (cola + motor: éxito, reintentos,
fallas, idempotencia, sin red). El flujo completo contra PostgreSQL real se
verifica con `pnpm --filter @nexosoft/cloud-api verify:e2e`.
