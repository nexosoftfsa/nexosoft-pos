# ADR-0037: Venta a cuenta corriente (fiado)

- **Estado:** Aceptada
- **Fecha:** 2026-07-05
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0027 (clientes y cuenta corriente), ADR-0029 (pago combinado)

## Contexto

Un almacén vende "fiado": el cliente se lleva la mercadería y la deuda queda en su
cuenta corriente. Hasta ahora la venta exigía cobro completo y el cargo a cuenta se
hacía manualmente desde la pantalla de cuentas corrientes. Faltaba cerrar el
circuito: elegir el cliente en la venta y que la parte fiada genere el cargo.

## Decisión

1. **El dominio ya modela "Cuenta corriente" como forma de pago.** `calcularCobro`
   la cuenta como cualquier pago: si la venta se paga (total o parcialmente) con
   "Cuenta corriente", queda cancelada y se confirma. No hizo falta tocar el
   dominio.
2. **La venta lleva `clienteId`** (nuevo campo en `Venta`, y en `CrearVentaDto` /
   el payload de sync). El POS ofrece un **selector de cliente** en la pantalla de
   ventas y "Cuenta corriente" como forma de pago; si se paga con cuenta corriente
   sin cliente elegido, el POS lo bloquea con un mensaje.
3. **`VentasService.registrar` genera el CARGO** por la porción pagada con
   `CUENTA_CORRIENTE` (con desglose: la suma de esos pagos; sin desglose: el total
   si el medio es CC), en la **misma transacción** que la venta.
4. **No se bloquea por límite de crédito al sincronizar**: la venta ya ocurrió
   (offline), rechazar la ingesta dejaría la venta huérfana. El control de límite
   vive en el POS al momento de vender (evolución); acá el cargo se registra
   siempre.

## Consecuencias

- Vender fiado es una venta normal con un cliente y un pago "Cuenta corriente": el
  stock baja, el comprobante se emite y la deuda del cliente sube, todo atómico.
- Funciona con pago combinado (parte en efectivo, parte fiada): sólo la porción CC
  va a la deuda.

## Alternativas consideradas

- **Llamar a `ClientesService.registrarCargo`** (que valida el límite) desde la
  venta — descartado: su 409 por exceso de límite tumbaría la sincronización de una
  venta ya hecha. Se crea el movimiento directo, sin bloqueo.
- **Mantener el cargo manual** — descartado: el usuario quería cerrar el circuito
  de fiado desde la propia venta.
