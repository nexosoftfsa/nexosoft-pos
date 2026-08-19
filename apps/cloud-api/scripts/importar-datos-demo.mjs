/**
 * Importa el .json armado por exportar-datos-demo.mjs (catalogo + ventas
 * ficticias de otro servidor NexoSoft) en ESTE servidor: usa la sucursal y
 * el usuario que ya existan aca (no crea ni pisa usuarios/contraseñas de
 * nadie), reusa categorias por nombre y productos por codigo (omite los
 * que ya existan, no los pisa), e inserta las ventas ficticias sin tocar
 * el stock -- mismo criterio que generar-ventas-prueba.mjs.
 *
 * Idempotente: se puede correr mas de una vez, no duplica nada.
 *
 * Uso (parado en la carpeta del servidor, con el Node portable si es una
 * instalacion por el instalador de servidor):
 *   node scripts/importar-datos-demo.mjs --archivo ruta\a\datos-demo.json
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const LOTE = 500;

function leerArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--archivo');
  const archivo = i >= 0 ? args[i + 1] : undefined;
  if (!archivo) throw new Error('Falta --archivo <ruta al .json exportado>');
  return { archivo };
}

async function insertarEnLotes(prisma, modelo, filas) {
  for (let i = 0; i < filas.length; i += LOTE) {
    await prisma[modelo].createMany({ data: filas.slice(i, i + LOTE) });
  }
}

async function main() {
  const { archivo } = leerArgs();
  const datos = JSON.parse(readFileSync(archivo, 'utf-8'));
  const prisma = new PrismaClient();
  try {
    const sucursal = await prisma.sucursal.findFirst();
    if (!sucursal) throw new Error('No hay ninguna sucursal en esta base -- corre el instalador primero.');
    const usuario = await prisma.usuario.findFirst({ where: { sucursalId: sucursal.id, activo: true } });
    if (!usuario) throw new Error('No hay ningun usuario activo en esta sucursal.');
    console.log(`Sucursal: ${sucursal.nombre} · Usuario: ${usuario.email}\n`);

    // Categorias: reusar por nombre, crear la que falte.
    const idCategoriaPorNombre = new Map(
      (await prisma.categoria.findMany()).map((c) => [c.nombre, c.id]),
    );
    for (const c of datos.categorias) {
      if (idCategoriaPorNombre.has(c.nombre)) continue;
      const nueva = await prisma.categoria.create({ data: { nombre: c.nombre } });
      idCategoriaPorNombre.set(c.nombre, nueva.id);
    }
    console.log(`Categorias: ${idCategoriaPorNombre.size} disponibles.`);

    // Productos: por codigo, en ESTA sucursal. Se omite (no se pisa) el que ya exista.
    const codigosExistentes = new Map(
      (
        await prisma.producto.findMany({
          where: { sucursalId: sucursal.id, codigo: { in: datos.productos.map((p) => p.codigo) } },
          select: { id: true, codigo: true },
        })
      ).map((p) => [p.codigo, p.id]),
    );
    const productosNuevos = datos.productos.filter((p) => !codigosExistentes.has(p.codigo));
    const productosData = productosNuevos.map((p) => ({
      id: randomUUID(),
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precioVenta: p.precioVenta,
      precioCosto: p.precioCosto,
      tipoIva: p.tipoIva,
      activo: p.activo,
      sucursalId: sucursal.id,
      categoriaId: p.categoriaNombre ? (idCategoriaPorNombre.get(p.categoriaNombre) ?? null) : null,
    }));
    await insertarEnLotes(prisma, 'producto', productosData);
    const codigoAProductoId = new Map([...codigosExistentes, ...productosData.map((p) => [p.codigo, p.id])]);
    console.log(`Productos: ${productosData.length} creados, ${codigosExistentes.size} ya existian.`);

    // Ventas ficticias: se omiten (por operacionId) las que ya esten importadas.
    const operacionIdsExistentes = new Set(
      (
        await prisma.venta.findMany({
          where: { operacionId: { in: datos.ventas.map((v) => v.operacionId) } },
          select: { operacionId: true },
        })
      ).map((v) => v.operacionId),
    );
    const ventasData = [];
    const itemsData = [];
    const pagosData = [];
    let itemsSinProducto = 0;
    for (const v of datos.ventas) {
      if (operacionIdsExistentes.has(v.operacionId)) continue;
      const itemsValidos = v.items.filter((it) => it.productoCodigo && codigoAProductoId.has(it.productoCodigo));
      itemsSinProducto += v.items.length - itemsValidos.length;
      if (itemsValidos.length === 0) continue;

      const ventaId = randomUUID();
      ventasData.push({
        id: ventaId,
        operacionId: v.operacionId,
        sucursalId: sucursal.id,
        usuarioId: usuario.id,
        medioPago: v.medioPago,
        estado: v.estado,
        tipoComprobante: v.tipoComprobante,
        subtotal: v.subtotal,
        descuento: v.descuento,
        total: v.total,
        creadaEn: new Date(v.creadaEn),
      });
      for (const it of itemsValidos) {
        itemsData.push({
          id: randomUUID(),
          ventaId,
          productoId: codigoAProductoId.get(it.productoCodigo),
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
          descuento: it.descuento,
          subtotal: it.subtotal,
          costoUnitario: it.costoUnitario,
        });
      }
      for (const p of v.pagos) {
        pagosData.push({ id: randomUUID(), ventaId, medioPago: p.medioPago, monto: p.monto });
      }
    }
    await insertarEnLotes(prisma, 'venta', ventasData);
    await insertarEnLotes(prisma, 'itemVenta', itemsData);
    await insertarEnLotes(prisma, 'pago', pagosData);

    console.log(`Ventas: ${ventasData.length} creadas, ${operacionIdsExistentes.size} ya existian.`);
    if (itemsSinProducto > 0) {
      console.log(`  (${itemsSinProducto} items se omitieron por no encontrar el producto -- no deberia pasar.)`);
    }
    console.log('\nListo. No se toco el stock.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e);
  process.exitCode = 1;
});
