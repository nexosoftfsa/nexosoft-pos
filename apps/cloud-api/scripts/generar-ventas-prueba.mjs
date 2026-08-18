/**
 * Genera ventas ficticias para probar el panel de Reportes y Estadísticas
 * con volumen real (Fase 12.I). Inserta venta + ítems + pago directo por
 * Prisma en bloque (createMany), sin pasar por VentasService.registrar() y
 * SIN generar movimientos de stock: el objetivo es solo poblar Reportes,
 * no tocar las existencias reales del catálogo. `tipoComprobante:
 * "TicketNoFiscal"` para que quede clara la traza de que son datos de
 * prueba, no ventas fiscales reales.
 *
 * Uso (desde apps/cloud-api, contra la base real del .env):
 *   node scripts/generar-ventas-prueba.mjs [--mes 2026-07] [--min 100] [--max 150]
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');

const MEDIOS_PAGO = [
  { medio: 'EFECTIVO', peso: 45 },
  { medio: 'TARJETA_DEBITO', peso: 20 },
  { medio: 'TARJETA_CREDITO', peso: 15 },
  { medio: 'MERCADOPAGO_QR', peso: 12 },
  { medio: 'TRANSFERENCIA', peso: 8 },
];
const PESO_TOTAL = MEDIOS_PAGO.reduce((a, m) => a + m.peso, 0);
const LOTE = 500;

function elegirMedioPago() {
  let r = Math.random() * PESO_TOTAL;
  for (const m of MEDIOS_PAGO) {
    if (r < m.peso) return m.medio;
    r -= m.peso;
  }
  return MEDIOS_PAGO[0].medio;
}

function leerArgs() {
  const args = process.argv.slice(2);
  const valor = (nombre, porDefecto) => {
    const i = args.indexOf(`--${nombre}`);
    return i >= 0 ? args[i + 1] : porDefecto;
  };
  return {
    mes: valor('mes', '2026-07'),
    min: Number(valor('min', '100')),
    max: Number(valor('max', '150')),
  };
}

function diasDelMes(mes) {
  const [anio, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(anio, m, 0).getDate();
  const dias = [];
  for (let d = 1; d <= ultimoDia; d++) dias.push(new Date(anio, m - 1, d));
  return dias;
}

/** Hora al azar dentro de un horario comercial razonable (8:00–20:59). */
function horaAlAzarEnDia(dia) {
  const f = new Date(dia);
  f.setHours(8 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return f;
}

async function insertarEnLotes(prisma, modelo, filas) {
  for (let i = 0; i < filas.length; i += LOTE) {
    await prisma[modelo].createMany({ data: filas.slice(i, i + LOTE) });
  }
}

async function main() {
  const { mes, min, max } = leerArgs();
  const prisma = new PrismaClient();
  try {
    const sucursal = await prisma.sucursal.findFirst();
    if (!sucursal) throw new Error('No hay ninguna sucursal en la base.');

    const usuarios = await prisma.usuario.findMany({ where: { sucursalId: sucursal.id, activo: true } });
    if (usuarios.length === 0) throw new Error('No hay usuarios activos en la sucursal.');

    const terminal = await prisma.terminal.findFirst({
      where: { sucursalId: sucursal.id, nombre: 'Caja 1', activa: true },
    });

    const productos = await prisma.producto.findMany({
      where: { sucursalId: sucursal.id, activo: true },
      select: { id: true, precioVenta: true, precioCosto: true },
    });
    if (productos.length === 0) throw new Error('No hay productos activos en el catálogo.');

    console.log(`Sucursal: ${sucursal.nombre}`);
    console.log(`Usuarios: ${usuarios.length} · Productos activos: ${productos.length} · Terminal: ${terminal?.nombre ?? '(ninguna)'}`);
    console.log(`Mes: ${mes} · ${min}-${max} ventas por día\n`);

    const dias = diasDelMes(mes);
    const ventasData = [];
    const itemsData = [];
    const pagosData = [];
    let totalGeneral = new Decimal(0);
    let contador = 0;

    for (const dia of dias) {
      const cantidadVentas = min + Math.floor(Math.random() * (max - min + 1));
      for (let i = 0; i < cantidadVentas; i++) {
        contador++;
        const ventaId = randomUUID();
        const usuario = usuarios[Math.floor(Math.random() * usuarios.length)];
        const cantidadItems = 1 + Math.floor(Math.random() * 4); // 1 a 4
        let subtotalVenta = new Decimal(0);

        for (let j = 0; j < cantidadItems; j++) {
          const producto = productos[Math.floor(Math.random() * productos.length)];
          const cantidad = new Decimal(1 + Math.floor(Math.random() * 3)); // 1 a 3
          const precioUnitario = new Decimal(producto.precioVenta);
          const importe = precioUnitario.mul(cantidad);
          subtotalVenta = subtotalVenta.add(importe);
          itemsData.push({
            id: randomUUID(),
            ventaId,
            productoId: producto.id,
            cantidad,
            precioUnitario,
            descuento: new Decimal(0),
            subtotal: importe,
            costoUnitario: new Decimal(producto.precioCosto),
          });
        }

        const medioPago = elegirMedioPago();
        ventasData.push({
          id: ventaId,
          operacionId: `prueba-${mes}-${String(contador).padStart(5, '0')}`,
          sucursalId: sucursal.id,
          usuarioId: usuario.id,
          terminalId: terminal?.id ?? null,
          medioPago,
          estado: 'COMPLETADA',
          tipoComprobante: 'TicketNoFiscal',
          subtotal: subtotalVenta,
          descuento: new Decimal(0),
          total: subtotalVenta,
          creadaEn: horaAlAzarEnDia(dia),
        });
        pagosData.push({ id: randomUUID(), ventaId, medioPago, monto: subtotalVenta });
        totalGeneral = totalGeneral.add(subtotalVenta);
      }
      console.log(`  ${dia.toISOString().slice(0, 10)}: ${cantidadVentas} ventas`);
    }

    console.log(`\nInsertando ${ventasData.length} ventas, ${itemsData.length} ítems, ${pagosData.length} pagos...`);
    await insertarEnLotes(prisma, 'venta', ventasData);
    await insertarEnLotes(prisma, 'itemVenta', itemsData);
    await insertarEnLotes(prisma, 'pago', pagosData);

    console.log('\n=== Listo ===');
    console.log(`  Ventas:        ${ventasData.length}`);
    console.log(`  Ítems:         ${itemsData.length}`);
    console.log(`  Pagos:         ${pagosData.length}`);
    console.log(`  Total vendido: $${totalGeneral.toFixed(2)}`);
    console.log('\nNo se tocó el stock (sin movimientos de existencia).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e);
  process.exitCode = 1;
});
