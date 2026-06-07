# ADR-0010: Pasarela de pago aislada (MercadoPago Point/QR)

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

El POS debe cobrar con tarjetas y billeteras. Se eligió **MercadoPago** (por
ahora): **Point** para tarjeta presencial y **QR** para billetera. Es una
integración **online** y externa que no debe acoplar el flujo de venta
offline-first ni dispersarse por el código.

## Decisión

Crear `@nexosoft/pagos` con la interfaz **`PasarelaDePago`** (puerto):
`crearIntencionDePago`, `consultarEstado`, `cancelar`, `reembolsar`.
Implementaciones:
- `MercadoPagoPasarela`: Point (terminal) + QR.
- `MockPasarela`: aprueba/rechaza/simula demoras para desarrollo y tests sin red.

El cobro electrónico es **online**: si no hay conexión, la venta se cierra
registrando la forma de pago y el cobro queda **pendiente de conciliación**; al
recuperar conexión se confirma contra MercadoPago. Idempotencia por
`intencionPagoId` para no duplicar cobros.

## Consecuencias

### Positivas
- El POS depende del contrato, no de MercadoPago; swap de pasarela sin tocar venta.
- Desarrollo/tests con `MockPasarela`, sin credenciales ni hardware.

### Negativas / costos
- **Point** requiere el SDK/integración propia de MercadoPago y, según modelo,
  hardware específico; no se puede probar en este entorno.
- Hay que manejar estados intermedios (pendiente, aprobado, rechazado, reverso) y
  su conciliación con la caja.

## Alternativas consideradas

- **Payway / Getnet / Clover / otras** — válidas; el diseño por puerto permite
  sumarlas luego. Reevaluable.
- **Integrar MercadoPago directo en el módulo de venta** — acopla y complica tests.
