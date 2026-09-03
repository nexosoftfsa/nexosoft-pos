-- Concepto de una Nota de Debito.
--
-- Una ND no vende productos: se emite por intereses de mora, un flete que se
-- factura despues, un ajuste de precio hacia arriba. Como "items_venta" exige
-- un productoId real, la ND no puede tener items, y sin items el comprobante
-- no tendria que mostrar en el papel.
--
-- El concepto va en la venta y la impresion arma con el una unica linea junto
-- con el total. Es el mismo texto que el cajero escribe al emitirla, asi que
-- tiene que ser algo que el cliente entienda.
--
-- Aditiva y nullable: no bloquea, no reescribe filas, y una version anterior
-- del servidor corriendo contra esta base sigue funcionando.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN "conceptoLibre" TEXT;
