/**
 * Exporta el catalogo real + las ventas ficticias de prueba (identificadas
 * por el prefijo de operacionId que uso generar-ventas-prueba.mjs, "prueba-")
 * a un .json portable, para poder pasarselo a OTRO comercio/servidor
 * NexoSoft y que pueda ver el panel de Reportes con volumen real de datos
 * sin generar los suyos desde cero.
 *
 * Deliberadamente NO exporta usuarios (nada de logins/contraseñas viaja):
 * el importador usa el usuario que ya exista en el servidor destino.
 *
 * Uso (desde apps/cloud-api, contra la base real del .env):
 *   node scripts/exportar-datos-demo.mjs [--salida datos-demo.json] [--prefijo prueba-]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

function leerArgs() {
  const args = process.argv.slice(2);
  const valor = (nombre, porDefecto) => {
    const i = args.indexOf(`--${nombre}`);
    return i >= 0 ? args[i + 1] : porDefecto;
  };
  return {
    salida: valor('salida', 'datos-demo.json'),
    prefijo: valor('prefijo', 'prueba-'),
  };
}

async function main() {
  const { salida, prefijo } = leerArgs();
  const prisma = new PrismaClient();
  try {
    const categorias = await prisma.categoria.findMany();
    const productos = await prisma.producto.findMany();
    const ventas = await prisma.venta.findMany({
      where: { operacionId: { startsWith: prefijo } },
      include: { items: true, pagos: true },
    });

    const nombreCategoriaPorId = new Map(categorias.map((c) => [c.id, c.nombre]));
    const codigoPorProductoId = new Map(productos.map((p) => [p.id, p.codigo]));

    const datos = {
      categorias: categorias.map((c) => ({ nombre: c.nombre })),
      productos: productos.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioVenta: p.precioVenta.toString(),
        precioCosto: p.precioCosto.toString(),
        tipoIva: p.tipoIva,
        activo: p.activo,
        categoriaNombre: p.categoriaId ? (nombreCategoriaPorId.get(p.categoriaId) ?? null) : null,
      })),
      ventas: ventas.map((v) => ({
        operacionId: v.operacionId,
        medioPago: v.medioPago,
        estado: v.estado,
        tipoComprobante: v.tipoComprobante,
        subtotal: v.subtotal.toString(),
        descuento: v.descuento.toString(),
        total: v.total.toString(),
        creadaEn: v.creadaEn,
        items: v.items.map((it) => ({
          productoCodigo: codigoPorProductoId.get(it.productoId) ?? null,
          cantidad: it.cantidad.toString(),
          precioUnitario: it.precioUnitario.toString(),
          descuento: it.descuento.toString(),
          subtotal: it.subtotal.toString(),
          costoUnitario: it.costoUnitario ? it.costoUnitario.toString() : null,
        })),
        pagos: v.pagos.map((p) => ({ medioPago: p.medioPago, monto: p.monto.toString() })),
      })),
    };

    writeFileSync(salida, JSON.stringify(datos));
    console.log(`Exportado a ${salida}:`);
    console.log(`  Categorias: ${datos.categorias.length}`);
    console.log(`  Productos:  ${datos.productos.length}`);
    console.log(`  Ventas:     ${datos.ventas.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e);
  process.exitCode = 1;
});
