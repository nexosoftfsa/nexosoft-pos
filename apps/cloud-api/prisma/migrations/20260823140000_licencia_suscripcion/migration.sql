-- Fase 17.B (ADR-0056): guarda la ultima licencia de suscripcion recibida.
-- Se persiste para que reiniciar el servidor no la pierda: sin esto, un
-- comercio bloqueado se desbloquearia con solo reiniciar el servicio.
-- El token esta firmado: se puede leer, no falsificar.

-- AlterTable
ALTER TABLE "configuracion_sistema" ADD COLUMN "licenciaToken" TEXT;
ALTER TABLE "configuracion_sistema" ADD COLUMN "licenciaComercioId" TEXT;
