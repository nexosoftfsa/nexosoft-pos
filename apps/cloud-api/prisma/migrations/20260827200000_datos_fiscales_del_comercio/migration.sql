-- Datos fiscales del comercio en el SERVIDOR (Fase 18).
--
-- Hasta ahora vivian solo en la copia local del POS, que alcanzaba para
-- imprimirlos en el ticket. Para pedirle el CAE a ARCA los necesita el
-- servidor: es el que habla con ARCA, y cada terminal podria tener una copia
-- distinta del punto de venta -- lo que romperia la numeracion.
--
-- Todas las columnas son opcionales y aditivas: una version anterior del
-- servidor sigue funcionando contra esta base, y un comercio que todavia no
-- factura no necesita completarlas.

ALTER TABLE "configuracion_sistema" ADD COLUMN "cuit" TEXT;
ALTER TABLE "configuracion_sistema" ADD COLUMN "razonSocial" TEXT;
ALTER TABLE "configuracion_sistema" ADD COLUMN "puntoDeVenta" INTEGER;
ALTER TABLE "configuracion_sistema" ADD COLUMN "condicionIvaEmisor" TEXT;

-- Se arranca en homologacion a proposito: emitir comprobantes reales tiene
-- que ser una decision explicita, no el default de una actualizacion.
ALTER TABLE "configuracion_sistema" ADD COLUMN "arcaEntorno" TEXT DEFAULT 'homologacion';
