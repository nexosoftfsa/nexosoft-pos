# @nexosoft/hardware

Abstracción de periféricos de comercio para NexoSoft.

Define los **puertos** (interfaces TypeScript) para impresora térmica, lector de
código de barras y balanza, y provee **mocks funcionales** para desarrollo y tests.
Ver [ADR-0018](../../docs/adr/0018-abstraccion-hardware-puertos-y-mocks.md).

## Puertos disponibles

| Puerto             | Archivo        | Qué hace                                      |
| ------------------ | -------------- | --------------------------------------------- |
| `ImpresoraTermica` | `impresora.ts` | Imprime tickets, abre cajón, verifica estado  |
| `LectorDeBarras`   | `lector.ts`    | Observer de escaneos: `onEscaneo(cb) → unsub` |
| `Balanza`          | `balanza.ts`   | Lee peso, tara, verifica conexión             |

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

## Qué dice el papel, decidido una sola vez

`impresora.ts` no imprime: **decide**. Las funciones puras que viven ahí
(`letraFiscal`, `subtotalNeto`, `lineasSinIva`, `transparenciaFiscal`,
`renglonesDelEmisor`…) las consumen los **tres renderers** — el A4, el ticket
HTML y la térmica ESC/POS — para que los tres lleguen a la misma conclusión.

No es prolijidad: cuando cada uno decidió por su cuenta, el original de una
Factura A salió con "IVA 0%" y su duplicado con "Exento"
([ADR-0084](../../docs/adr/0084-el-papel-y-arca-dicen-lo-mismo.md)).

`renglonesDelEmisor()` arma el domicilio comercial, el número de Ingresos
Brutos y la fecha de inicio de actividades que la RG 1415 pide en el
encabezado ([ADR-0085](../../docs/adr/0085-datos-del-emisor-en-el-encabezado.md)).
Los tres son opcionales y **el que falta no se imprime**: una instalación
anterior no los tiene cargados, y un renglón en blanco es peor que ninguno.

## Estado para producción

Los mocks son la única implementación disponible hasta que el cliente elija el
hardware. Los adaptadores reales (USB/serial desde la capa nativa de Tauri) se
implementan sin tocar el POS ni el dominio.

## Tests

```bash
pnpm --filter @nexosoft/hardware test
```
