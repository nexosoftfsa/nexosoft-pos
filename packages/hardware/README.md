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

> Los modelos concretos de **balanza** e **impresora** a soportar primero
> dependen de tu respuesta en Fase 0. El diseño por puertos permite agregar
> drivers sin tocar el POS.

## Estado

🔜 Fase 1: `Impresora` ESC/POS (la más crítica para el ticket) + mocks y tests.
