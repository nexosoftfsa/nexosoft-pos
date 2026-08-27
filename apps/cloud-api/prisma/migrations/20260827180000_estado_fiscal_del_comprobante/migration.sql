-- Estado de la autorizacion fiscal, SEPARADO del estado comercial de la venta.
--
-- Hace falta para que una caida de ARCA no frene la venta: el comercio vende,
-- cobra e imprime, y el CAE se consigue despues. Va en una columna propia y no
-- en "estado" a proposito: una venta esperando el CAE es una venta hecha y
-- cobrada, tiene que seguir contando en reportes, caja y stock. Los reportes
-- filtran por estado = 'COMPLETADA', asi que meterlo ahi habria borrado las
-- ventas del dia de los reportes cada vez que AFIP no responde.
--
-- Aditiva y con defaults: no bloquea, no reescribe filas existentes salvo el
-- UPDATE final, y no rompe una version anterior del servidor corriendo contra
-- esta base (las columnas nuevas tienen default).

-- CreateEnum
CREATE TYPE "EstadoFiscal" AS ENUM ('NO_APLICA', 'PENDIENTE', 'AUTORIZADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN "estadoFiscal" "EstadoFiscal" NOT NULL DEFAULT 'NO_APLICA';
ALTER TABLE "ventas" ADD COLUMN "motivoFiscal" TEXT;
ALTER TABLE "ventas" ADD COLUMN "intentosCae" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ventas" ADD COLUMN "ultimoIntentoCae" TIMESTAMP(3);

-- Los comprobantes que YA tienen CAE quedan como autorizados. Sin esto, todo
-- el historico fiscal del comercio apareceria como "no aplica".
UPDATE "ventas" SET "estadoFiscal" = 'AUTORIZADA' WHERE "cae" IS NOT NULL;

-- Los pendientes se buscan por este indice en cada reintento, ordenados por
-- fecha: el CAE se pide en orden, porque ARCA valida que la numeracion sea
-- correlativa por punto de venta.
CREATE INDEX "ventas_estadoFiscal_creadaEn_idx" ON "ventas" ("estadoFiscal", "creadaEn");
