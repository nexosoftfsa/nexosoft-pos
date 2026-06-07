# @nexosoft/pagos

Cobros electrónicos aislados detrás de la interfaz **`PasarelaDePago`** (puerto).
El POS no conoce la API de MercadoPago: depende del contrato (ADR-0010).

## Responsabilidades

- `crearIntencionDePago`, `consultarEstado`, `cancelar`, `reembolsar`.
- Manejo de estados (pendiente / aprobado / rechazado / reverso) e idempotencia
  por `intencionPagoId`.

## Implementaciones

| Implementación         | Uso                                                   |
| ---------------------- | ----------------------------------------------------- |
| `MercadoPagoPasarela`  | **Point** (terminal) + **QR** (billetera). Online.    |
| `MockPasarela`         | Desarrollo y tests sin red ni credenciales.           |

> **Offline-first:** sin conexión, la venta se cierra registrando la forma de
> pago; el cobro electrónico queda **pendiente de conciliación** y se confirma al
> recuperar conexión. **Point** requiere SDK/hardware de MercadoPago y no se
> puede probar en este entorno.

## Estado

🔜 Se integra después del POS base. En Fase 0 queda el contrato y la decisión.
