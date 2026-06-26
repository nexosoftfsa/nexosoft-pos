# ADR-0018: Implementación de puertos de hardware y mocks funcionales

- **Estado:** Aceptada
- **Fecha:** 2026-06-26

## Contexto

El comercio requerirá impresora térmica ESC/POS, lector de código de barras y
balanza, pero el modelo concreto de cada periférico aún no está definido. Se
necesita un diseño que permita desarrollar y testear el POS sin hardware presente
y enchufar los adaptadores reales cuando se conozca el modelo.

ADR-0009 decidió usar puertos y mocks; este ADR formaliza el contrato de cada
puerto y documenta qué falta para producción.

## Decisión

Se implementan tres puertos en `@nexosoft/hardware` con sus mocks:

### ImpresoraTermica
- `imprimirTicket(datos: DatosTicket): Promise<void>`
- `abrirCajon(): Promise<void>`
- `verificarEstado(): Promise<EstadoImpresora>`
- `DatosTicket` incluye cabecera del comercio, líneas del comprobante, subtotales
  de IVA, formas de pago y datos fiscales (CAE opcional).

### LectorDeBarras
- `onEscaneo(cb): () => void` — patrón observer; devuelve función de baja.
- `desconectar(): Promise<void>`
- Los lectores HID (USB plug-and-play) no necesitan driver: el SO los expone
  como teclado. El POS los captura con un listener de keydown global.
  Los lectores seriales requerirán un plugin Tauri adicional.

### Balanza
- `leerPeso(): Promise<Cantidad>`
- `tarar(): Promise<void>`
- `verificarEstado(): Promise<EstadoBalanza>`
- Protocolos RS-232 varían por marca (Toledo, Dibal, Mettler, etc.).

## Mocks

`MockImpresoraTermica` registra los tickets en `ticketsImpresos[]` y permite
configurar errores y estados (sin papel, sin conexión).

`MockLectorDeBarras` expone `simularEscaneo(codigo)` para disparar escaneos
desde tests.

`MockBalanza` expone `pesoSimulado` configurable y flags `forzarError` /
`forzarInestable`.

## Qué falta para producción

| Periférico | Pendiente |
|---|---|
| Impresora ESC/POS | Plugin Tauri (Rust) para USB/serial + adaptador que arme los bytes ESC/POS según el modelo |
| Lector HID | Solo listener de keydown — sin código adicional |
| Lector serial | Plugin Tauri para abrir puerto COM y emitir el código al frontend |
| Balanza | Plugin Tauri para RS-232 + parser de trama según marca/modelo |

Ningún cambio en la UI del POS ni en el dominio cuando se implementen estos
adaptadores: solo se inyecta la instancia real en lugar del mock.

## Consecuencias

- El POS puede desarrollarse y testearse sin ningún periférico presente.
- Agregar soporte para un modelo concreto no toca la capa de aplicación.
- Hay una deuda explícita: los adaptadores reales se implementan cuando el
  cliente elija el hardware.
