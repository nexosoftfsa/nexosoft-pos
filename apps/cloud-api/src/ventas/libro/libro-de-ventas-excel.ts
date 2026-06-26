import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import { Workbook } from 'exceljs';
import type { LibroDeVentas, FilaVenta } from './libro-de-ventas';

/**
 * Libro de ventas en Excel (ADR-0021). Una fila por venta, archivo que se va
 * actualizando. Vive en la carpeta de respaldo, así viaja a la nube propia del
 * cliente (Drive/OneDrive) junto con los snapshots.
 *
 * Las escrituras se **serializan** con una cola interna: el cloud-api es un solo
 * proceso, pero atiende ventas concurrentes y no podemos reescribir el .xlsx
 * desde dos requests a la vez sin corromperlo.
 */
export class LibroDeVentasExcel implements LibroDeVentas {
  private static readonly HOJA = 'Ventas';
  private static readonly ENCABEZADOS = [
    'Fecha', 'Operación', 'Comprobante', 'Sucursal', 'Usuario',
    'Medio de pago', 'Ítems', 'Subtotal', 'Descuento', 'Total', 'CAE',
  ];

  private readonly logger = new Logger(LibroDeVentasExcel.name);
  /** Cola de escritura: cada registro espera al anterior. */
  private cola: Promise<void> = Promise.resolve();

  constructor(private readonly rutaArchivo: string) {}

  registrar(fila: FilaVenta): Promise<void> {
    this.cola = this.cola.then(() => this.escribirFila(fila));
    return this.cola;
  }

  private async escribirFila(fila: FilaVenta): Promise<void> {
    await fs.mkdir(dirname(this.rutaArchivo), { recursive: true });

    const workbook = new Workbook();
    let hoja = await this.cargarOCrear(workbook);

    // Si ya existe una fila con este operacionId, la actualizamos (idempotencia).
    const filaExistente = this.buscarPorOperacion(hoja, fila.operacionId);
    const valores = [
      fila.fecha,
      fila.operacionId,
      fila.comprobante,
      fila.sucursalId,
      fila.usuario,
      fila.medioPago,
      fila.cantidadItems,
      Number(fila.subtotal),
      Number(fila.descuento),
      Number(fila.total),
      fila.cae,
    ];

    if (filaExistente) {
      // Al asignar por array contiguo, exceljs mapea el índice 0 → columna 1
      // (igual que addRow): NO se antepone un hueco.
      filaExistente.values = valores;
      filaExistente.commit();
    } else {
      hoja.addRow(valores);
    }

    await workbook.xlsx.writeFile(this.rutaArchivo);
  }

  private async cargarOCrear(workbook: Workbook) {
    try {
      await workbook.xlsx.readFile(this.rutaArchivo);
      const hoja = workbook.getWorksheet(LibroDeVentasExcel.HOJA);
      if (hoja) return hoja;
    } catch {
      // el archivo no existe todavía: lo creamos desde cero
    }
    return this.crearHoja(workbook);
  }

  private crearHoja(workbook: Workbook) {
    const hoja = workbook.addWorksheet(LibroDeVentasExcel.HOJA);
    hoja.addRow(LibroDeVentasExcel.ENCABEZADOS);
    hoja.getRow(1).font = { bold: true };
    hoja.columns.forEach((col) => {
      col.width = 16;
    });
    return hoja;
  }

  private buscarPorOperacion(hoja: ReturnType<Workbook['getWorksheet']> & object, operacionId: string) {
    let encontrada: ReturnType<typeof hoja.getRow> | undefined;
    hoja.eachRow((row, numero) => {
      if (numero === 1) return; // encabezados
      if (row.getCell(2).value === operacionId) encontrada = row;
    });
    return encontrada;
  }
}
