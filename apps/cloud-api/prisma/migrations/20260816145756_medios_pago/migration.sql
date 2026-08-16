-- CreateEnum
CREATE TYPE "TipoTarjeta" AS ENUM ('DEBITO', 'CREDITO');

-- CreateTable
CREATE TABLE "tarjetas_config" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipo" "TipoTarjeta" NOT NULL,
    "marca" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sucursalId" TEXT NOT NULL,

    CONSTRAINT "tarjetas_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasas_cuota" (
    "id" TEXT NOT NULL,
    "cantidadCuotas" INTEGER NOT NULL,
    "recargoPorcentaje" DECIMAL(5,2) NOT NULL,
    "tarjetaConfigId" TEXT NOT NULL,

    CONSTRAINT "tasas_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasas_cuota_tarjetaConfigId_cantidadCuotas_key" ON "tasas_cuota"("tarjetaConfigId", "cantidadCuotas");

-- AddForeignKey
ALTER TABLE "tarjetas_config" ADD CONSTRAINT "tarjetas_config_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasas_cuota" ADD CONSTRAINT "tasas_cuota_tarjetaConfigId_fkey" FOREIGN KEY ("tarjetaConfigId") REFERENCES "tarjetas_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;
