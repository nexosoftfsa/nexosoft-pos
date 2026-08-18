-- CreateIndex
CREATE UNIQUE INDEX "ventas_sucursalId_tipoComprobante_numeroComprobante_key" ON "ventas"("sucursalId", "tipoComprobante", "numeroComprobante");
