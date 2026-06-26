import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workbook } from 'exceljs';
import { LibroDeVentasExcel } from './libro-de-ventas-excel';
import type { FilaVenta } from './libro-de-ventas';

function fila(operacionId: string, total: string): FilaVenta {
  return {
    fecha: new Date('2026-06-26T10:00:00Z'),
    operacionId,
    comprobante: 'FacturaB 1',
    sucursalId: 's1',
    usuario: 'cajero@nexo.com',
    medioPago: 'EFECTIVO',
    cantidadItems: 2,
    subtotal: total,
    descuento: '0',
    total,
    cae: '12345678901234',
  };
}

async function abrir(ruta: string) {
  const wb = new Workbook();
  await wb.xlsx.readFile(ruta);
  const hoja = wb.getWorksheet('Ventas');
  if (!hoja) throw new Error('hoja Ventas no encontrada');
  return hoja;
}

describe('LibroDeVentasExcel', () => {
  let dir: string;
  let ruta: string;
  let libro: LibroDeVentasExcel;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexo-libro-'));
    ruta = join(dir, 'ventas.xlsx');
    libro = new LibroDeVentasExcel(ruta);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('crea el archivo con encabezados y una fila', async () => {
    await libro.registrar(fila('op-1', '100'));

    const hoja = await abrir(ruta);
    expect(hoja.rowCount).toBe(2); // encabezado + 1
    expect(hoja.getRow(1).getCell(1).value).toBe('Fecha');
    expect(hoja.getRow(1).getCell(11).value).toBe('CAE');
    expect(hoja.getRow(2).getCell(2).value).toBe('op-1');
    expect(hoja.getRow(2).getCell(10).value).toBe(100); // total como número
  });

  it('agrega filas en ventas sucesivas', async () => {
    await libro.registrar(fila('op-1', '100'));
    await libro.registrar(fila('op-2', '200'));
    await libro.registrar(fila('op-3', '300'));

    const hoja = await abrir(ruta);
    expect(hoja.rowCount).toBe(4); // encabezado + 3
  });

  it('actualiza la fila existente por operacionId, sin duplicar', async () => {
    await libro.registrar(fila('op-1', '100'));
    await libro.registrar(fila('op-1', '999')); // mismo operacionId, nuevo total

    const hoja = await abrir(ruta);
    expect(hoja.rowCount).toBe(2); // sigue siendo encabezado + 1

    // Busco la fila de op-1 y verifico el total actualizado
    let total: unknown;
    hoja.eachRow((row, n) => {
      if (n > 1 && row.getCell(2).value === 'op-1') total = row.getCell(10).value;
    });
    expect(total).toBe(999);
  });

  it('serializa escrituras concurrentes sin corromper el archivo', async () => {
    await Promise.all([
      libro.registrar(fila('op-1', '100')),
      libro.registrar(fila('op-2', '200')),
      libro.registrar(fila('op-3', '300')),
    ]);

    const hoja = await abrir(ruta);
    expect(hoja.rowCount).toBe(4); // encabezado + 3, ninguna escritura se perdió
  });
});
