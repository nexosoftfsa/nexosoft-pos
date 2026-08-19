-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "fotoBase64" TEXT;

-- CreateTable
CREATE TABLE "credenciales_acceso" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadaEn" TIMESTAMP(3),
    "ultimoUsoEn" TIMESTAMP(3),

    CONSTRAINT "credenciales_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "exito" BOOLEAN NOT NULL DEFAULT true,
    "detalle" TEXT,
    "ip" TEXT,
    "usuarioId" TEXT,
    "sucursalId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_acceso_usuarioId_key" ON "credenciales_acceso"("usuarioId");

-- CreateIndex
CREATE INDEX "registro_auditoria_entidad_entidadId_idx" ON "registro_auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "registro_auditoria_sucursalId_creadoEn_idx" ON "registro_auditoria"("sucursalId", "creadoEn");

-- AddForeignKey
ALTER TABLE "credenciales_acceso" ADD CONSTRAINT "credenciales_acceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
