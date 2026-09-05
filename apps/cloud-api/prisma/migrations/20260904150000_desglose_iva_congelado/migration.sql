-- Desglose de IVA congelado al emitir.
--
-- Al reimprimir una Factura A el comprobante salia SIN discriminar IVA: solo el
-- total. La causa estaba anotada hace tiempo en el codigo -- el servidor no
-- persistia el desglose por alicuota -- y para la Factura C no importaba,
-- porque la C no discrimina. Para la A si: sin el desglose, el duplicado no
-- sirve como Factura A.
--
-- Se guarda lo que se le DECLARO A ARCA, no se recalcula. Si el producto cambia
-- de alicuota despues de la venta, recalcular daria un desglose distinto del
-- que se emitio, y el duplicado tiene que coincidir con el original.
--
-- Nullable: las ventas anteriores no lo tienen y se siguen reimprimiendo como
-- hasta ahora (sin discriminar). No se puede reconstruir hacia atras con
-- certeza, justamente por lo de arriba.
--
-- Aditiva: no bloquea, no reescribe filas, y una version anterior del servidor
-- corriendo contra esta base sigue funcionando.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN "impNeto" DECIMAL(12,2);
ALTER TABLE "ventas" ADD COLUMN "impIva" DECIMAL(12,2);
ALTER TABLE "ventas" ADD COLUMN "impOpEx" DECIMAL(12,2);
ALTER TABLE "ventas" ADD COLUMN "ivaPorAlicuota" JSONB;
