# @nexosoft/hardware

Abstracciones de los periféricos del comercio. Define **puertos** (interfaces) y
provee **mocks funcionales**; las implementaciones reales hablan USB/serial a
través de la capa nativa de Tauri (ADR-0009).

## Puertos

| Puerto       | Real                                  | Mock              |
| ------------ | ------------------------------------- | ----------------- |
| `Impresora`  | ESC/POS sobre USB/serial/red          | imprime a consola |
| `Balanza`    | protocolo por marca/modelo (serial)   | peso fijo/simulado|
| `Lector`     | HID (teclado) o serial                | inyecta códigos   |

> **Definido (2026-06-07):** se priorizan **impresoras térmicas ESC/POS**. La
> **balanza** queda como puerto (interfaz + mock) **sin driver concreto** hasta
> definir marca/modelo; agregarlo después no toca el POS.

## Estado

🔜 Fase 1: `Impresora` ESC/POS (la más crítica para el ticket) + mocks y tests.
`Balanza` y `Lector` quedan como puertos; el driver de balanza se difiere.
