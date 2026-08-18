/**
 * Backfill de numeroComprobante para comprobantes ya guardados sin número
 * (Fase 12.J): antes de esta fase, un `TicketNoFiscal` (venta sin CAE) se
 * persistía con `numeroComprobante: null` — no llevaba ninguna numeración,
 * ni siquiera interna. A partir de ahora `VentasService.registrar()`/`.anular()`
 * les asigna un correlativo propio por (sucursal, tipo). Este script numera
 * retroactivamente los que quedaron sin número, en orden cronológico
 * (`creadaEn`), continuando desde el máximo ya existente de ese mismo
 * (sucursal, tipo) si lo hubiera.
 *
 * Uso (desde apps/cloud-api, contra la base real del .env):
 *   node scripts/numerar-tickets-existentes.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const grupos = await prisma.venta.groupBy({
      by: ['sucursalId', 'tipoComprobante'],
      where: { numeroComprobante: null, tipoComprobante: { not: null } },
      _count: { _all: true },
    });

    if (grupos.length === 0) {
      console.log('No hay comprobantes sin numeroComprobante. Nada para hacer.');
      return;
    }

    for (const g of grupos) {
      const { _max } = await prisma.venta.aggregate({
        where: {
          sucursalId: g.sucursalId,
          tipoComprobante: g.tipoComprobante,
          numeroComprobante: { not: null },
        },
        _max: { numeroComprobante: true },
      });
      let siguiente = (_max.numeroComprobante ?? 0) + 1;

      const filas = await prisma.venta.findMany({
        where: { sucursalId: g.sucursalId, tipoComprobante: g.tipoComprobante, numeroComprobante: null },
        select: { id: true },
        orderBy: { creadaEn: 'asc' },
      });

      console.log(
        `${g.tipoComprobante} (sucursal ${g.sucursalId}): ${filas.length} comprobantes sin número, arrancando en ${siguiente}...`,
      );

      for (const fila of filas) {
        await prisma.venta.update({
          where: { id: fila.id },
          data: { numeroComprobante: siguiente },
        });
        siguiente += 1;
      }

      console.log(`  Listo: numerados del 1 al ${siguiente - 1}.`);
    }

    console.log('\n=== Backfill completo ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e);
  process.exitCode = 1;
});
