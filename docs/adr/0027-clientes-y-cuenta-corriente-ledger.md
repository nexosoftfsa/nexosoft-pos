# ADR-0027: Clientes y cuenta corriente como ledger

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0007 (dinero decimal), ADR-0025 (ABM online), ADR-0026
  (caja)

## Contexto

La Fase 7.5 agrega **Cuentas Corrientes**. No existía la entidad **Cliente** en el
schema (el medio de pago `CUENTA_CORRIENTE` ya estaba en el enum, pero sin a quién
imputarlo). Hay que poder registrar clientes, venderles a cuenta, cobrarles y ver
su saldo y estado de cuenta.

## Decisión

1. **Entidad `Cliente`** por sucursal (nombre, documento CUIT/DNI, condición IVA,
   contacto, `limiteCredito`, `activo`). Baja lógica (`activo = false`), no borra.
2. **La cuenta corriente es un ledger.** `MovimientoCuentaCorriente` con `tipo`
   **CARGO** (deuda: venta a cuenta) o **PAGO** (cobro). El
   **saldo = ΣCARGO − ΣPAGO** (positivo = el cliente debe), igual criterio que
   Stock/Caja (saldo = delta de movimientos). Auditable y sin campo de saldo
   mutable que se pueda desincronizar.
3. **Límite de crédito.** Si `limiteCredito > 0`, un CARGO que dejaría el saldo por
   encima del límite se rechaza (**409**). `0 = sin límite`.
4. **La "venta a cuenta" se registra como un CARGO desde la pantalla de cuentas
   corrientes** (online). La integración automática *venta en el POS con medio
   `CUENTA_CORRIENTE` → CARGO del cliente* queda como trabajo futuro: requiere
   meter `clienteId` en el flujo de venta (dominio + payload de sync + ingesta),
   un cambio transversal que no corresponde a esta sub-fase. El ledger + los
   clientes son el núcleo del valor ("saber quién debe cuánto").
5. **Dinero con `Decimal(12,2)`**, importes como string con 2 decimales, igual que
   el resto del backend.

## Consecuencias

### Positivas

- El dueño puede administrar clientes y su cuenta corriente (alta, venta a cuenta,
  cobro, estado de cuenta) desde el POS, online contra el servidor de sucursal.
- El saldo es derivado (una sola fuente de verdad: los movimientos), auditable.
- El límite de crédito aporta control real sobre el fiado.

### Negativas / costos

- Vender a cuenta requiere **dos pasos** por ahora (cobrar/entregar en el POS y
  registrar el cargo en cuentas corrientes) hasta integrar `clienteId` en la venta.
- El estado de cuenta se calcula sumando movimientos; para históricos enormes
  convendría paginar/materializar. Alcanza para el MVP.

## Alternativas consideradas

- **Guardar el saldo en `Cliente` y actualizarlo** — descartado: menos auditable y
  propenso a desincronizarse; el ledger es la fuente de verdad.
- **Integrar `clienteId` en la venta desde el inicio** — diferido: es un cambio
  transversal (dominio, sync, ingesta) que excede la sub-fase; se hará cuando se
  quiera el fiado directo desde el POS.
- **Tabla separada para proveedores** — fuera de alcance del MVP; la maqueta tenía
  una pestaña de proveedores, pero la prioridad es clientes/cobros.
