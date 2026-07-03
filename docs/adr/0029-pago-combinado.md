# ADR-0029: Pago combinado (desglose de pagos por venta)

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0005 (sincronización offline-first), ADR-0028 (comprobantes)

## Contexto

La Fase 7.8 arranca por **pago combinado**: pagar una venta con **varios medios**
(ej. parte efectivo, parte tarjeta). El dominio (`@nexosoft/app`) y la UI del POS
**ya lo soportaban localmente** (el ticket acepta varios pagos, con vuelto/saldo),
pero el desglose **no sobrevivía a la sincronización**: al encolar la venta se
mandaba un único `medioPago` (`pagos[0]`), y el `cloud-api` guardaba un solo medio
en `Venta.medioPago`. Se perdía la información de cómo se pagó.

## Decisión

Persistir el **desglose de pagos end-to-end**, de forma **retrocompatible**:

1. **Modelo `Pago`** (1—N con `Venta`): cada fila es un `medioPago` + `monto`. Se
   agrega el valor **`COMBINADO`** al enum `MedioPago` para el resumen de la venta.
2. **`Venta.medioPago` pasa a ser un resumen**: el único medio si todos los pagos
   coinciden, o `COMBINADO` si hay más de uno. `resumenMedioPago()` lo calcula
   (existe la misma función en el POS y en el backend).
3. **Contrato de sync**: `CrearVentaDto` gana `pagos?: { medioPago, monto }[]`
   (opcional). Como el ingest usa `whitelist: true`, el campo debe existir en el
   DTO para no descartarse. El payload de `construirOperacionVenta` lo incluye.
4. **El POS** arma el desglose desde los pagos del ticket
   (`forma → medioPago`, `monto`) y lo manda; el backend crea las filas `Pago` en
   la misma transacción de la venta.
5. **Retrocompatible**: sin `pagos`, todo funciona como antes (un solo
   `medioPago`, sin filas `Pago`).

## Consecuencias

### Positivas

- La venta registra **cómo** se pagó; el comprobante muestra el desglose.
- Cambio contenido: reusa la UI existente; el resto del flujo (idempotencia,
  stock, libro) queda intacto.
- `resumenMedioPago` centraliza la regla del resumen.

### Negativas / costos

- Los **reportes por medio de pago** agrupan por `Venta.medioPago`, así que una
  venta combinada cae en el bucket **"Combinado"** (no se reparte el monto por
  medio). Es honesto y simple para el MVP; repartir por `Pago` es una evolución
  futura si hace falta.
- Un valor más en el enum (`COMBINADO`) que los reportes/paneles deben etiquetar.

## Alternativas consideradas

- **Guardar los pagos como JSON en `Venta`** — descartado: un modelo relacional
  `Pago` es más consultable (reportes futuros por medio real) y consistente con el
  resto del schema.
- **Repartir el combinado por medio en los reportes ya** — diferido: implica
  cambiar la agregación de reportes a nivel `Pago`; para el MVP alcanza el bucket
  "Combinado" + el desglose visible en el comprobante.
