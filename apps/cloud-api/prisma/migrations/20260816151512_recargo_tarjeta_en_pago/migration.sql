-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "cuotas" INTEGER,
ADD COLUMN     "recargo" DECIMAL(12,2),
ADD COLUMN     "tarjetaConfigId" TEXT;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tarjetaConfigId_fkey" FOREIGN KEY ("tarjetaConfigId") REFERENCES "tarjetas_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
