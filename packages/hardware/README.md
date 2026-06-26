# @nexosoft/hardware

Abstracción de periféricos de comercio para NexoSoft.

Define los **puertos** (interfaces TypeScript) para impresora térmica, lector de
código de barras y balanza, y provee **mocks funcionales** para desarrollo y tests.
Ver [ADR-0018](../../docs/adr/0018-abstraccion-hardware-puertos-y-mocks.md).

## Puertos disponibles

| Puerto | Archivo | Qué hace |
|---|---|---|
| `ImpresoraTermica` | `impresora.ts` | Imprime tickets, abre cajón, verifica estado |
| `LectorDeBarras` | `lector.ts` | Observer de escaneos: `onEscaneo(cb) → unsub` |
| `Balanza` | `balanza.ts` | Lee peso, tara, verifica conexión |

## Mocks

```ts
import { MockImpresoraTermica, MockLectorDeBarras, MockBalanza } from "@nexosoft/hardware";

// Impresora
const impresora = new MockImpresoraTermica();
await impresora.imprimirTicket(datosTicket);
console.log(impresora.ticketsImpresos); // tickets recibidos

// Lector de barras
const lector = new MockLectorDeBarras();
const unsub = lector.onEscaneo((codigo) => console.log("escaneado:", codigo));
lector.simularEscaneo("7790001"); // dispara el callback
unsub(); // deja de escuchar

// Balanza
const balanza = new MockBalanza();
balanza.pesoSimulado = Cantidad.de("0.350");
const peso = await balanza.leerPeso(); // Cantidad("0.350")
```

## Estado para producción

Los mocks son la única implementación disponible hasta que el cliente elija el
hardware. Los adaptadores reales (USB/serial desde la capa nativa de Tauri) se
implementan sin tocar el POS ni el dominio.

## Tests

```bash
pnpm --filter @nexosoft/hardware test
```
