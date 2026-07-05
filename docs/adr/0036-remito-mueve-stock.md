# ADR-0036: El remito mueve stock (entrega)

- **Estado:** Aceptada
- **Fecha:** 2026-07-05
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0032 (remitos), ADR-0034 (lotes/FEFO)

## Contexto

Los remitos (ADR-0032) se emitían sin tocar stock ("futuro"). Un remito es un
documento de **entrega**: si sale mercadería, el stock debe bajar.

## Decisión

1. **Emitir un remito descuenta stock**: por cada ítem con `productoId` se crea un
   movimiento `SALIDA` (con **FEFO** para perecederos, ADR-0034), en la misma
   transacción que el remito. Las líneas libres (sin producto) no mueven stock.
2. **No bloquea por stock insuficiente** (a diferencia de la SALIDA manual): el
   remito documenta lo que ya se entregó; si los lotes no cubren la cantidad, el
   sobrante se registra sin lote (mismo criterio que la venta, ADR-0034).
3. **Anular restaura**: se espejan las `SALIDA` reales del remito como `ENTRADA`
   (al mismo lote), igual que la anulación de una venta.
4. Los movimientos se vinculan al remito con un nuevo `MovimientoStock.remitoId`,
   para poder revertirlos exactamente al anular.

## Consecuencias

- El circuito de entrega afecta el inventario y queda trazable (por `remitoId`).
- Emitir/anular remitos mantiene el saldo por producto y por lote consistente.

## Alternativas consideradas

- **Reusar `StockService.registrarMovimiento` por ítem** — descartado: bloquea por
  stock insuficiente y no compone en una transacción con la creación del remito.
- **No restaurar stock al anular** — descartado: dejaría el inventario
  inconsistente tras anular una entrega.
