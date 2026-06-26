/**
 * Adaptador SQLite de los repositorios (implementa los puertos de
 * `puertos/repositorios.ts` sobre un `EjecutorSql`). Mismo SQL para el POS
 * (Tauri) y para los tests (node:sqlite). El dinero se guarda en centavos y las
 * cantidades como texto (ver `mapeo.ts`).
 */
import {
  nuevoId,
  type Articulo,
  type Deposito,
  type Existencia,
  type ListaDePrecios,
  type MovimientoDeStock,
  type PrecioArticulo,
  type TipoComprobante,
} from "@nexosoft/domain";

import type {
  RepositorioArticulos,
  RepositorioExistencias,
  RepositorioMovimientos,
  RepositorioPrecios,
  RepositorioVentas,
  Repositorios,
} from "../puertos/repositorios.js";
import type { VentaConfirmada } from "../ventas/venta.js";
import type { EjecutorSql } from "./ejecutor-sql.js";
import { filaAArticulo, filaAExistencia, filaAPrecioArticulo } from "./mapeo.js";

const bool01 = (b: boolean): number => (b ? 1 : 0);

export class RepositorioArticulosSqlite implements RepositorioArticulos {
  constructor(private readonly db: EjecutorSql) {}

  async obtener(id: string): Promise<Articulo | undefined> {
    const filas = await this.db.consultar("SELECT * FROM articulo WHERE id = ?", [id]);
    const fila = filas[0];
    return fila ? filaAArticulo(fila) : undefined;
  }

  /** Alta o actualización (catálogo). */
  async guardar(a: Articulo): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO articulo (id, codigo_interno, codigo_barras, descripcion, rubro_id, proveedor_id, unidad_de_medida, costo_neto_cent, alicuota_iva, activo)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         codigo_interno=excluded.codigo_interno, codigo_barras=excluded.codigo_barras,
         descripcion=excluded.descripcion, rubro_id=excluded.rubro_id,
         proveedor_id=excluded.proveedor_id, unidad_de_medida=excluded.unidad_de_medida,
         costo_neto_cent=excluded.costo_neto_cent, alicuota_iva=excluded.alicuota_iva, activo=excluded.activo`,
      [
        a.id,
        a.codigoInterno,
        a.codigoBarras ?? null,
        a.descripcion,
        a.rubroId ?? null,
        a.proveedorId ?? null,
        a.unidadDeMedida,
        a.costoNeto.aCentavos(),
        String(a.alicuotaIva.porcentaje),
        bool01(a.activo),
      ],
    );
  }
}

export class RepositorioPreciosSqlite implements RepositorioPrecios {
  constructor(private readonly db: EjecutorSql) {}

  async obtener(articuloId: string, listaId: string): Promise<PrecioArticulo | undefined> {
    const filas = await this.db.consultar(
      "SELECT * FROM precio_articulo WHERE articulo_id = ? AND lista_id = ?",
      [articuloId, listaId],
    );
    const fila = filas[0];
    return fila ? filaAPrecioArticulo(fila) : undefined;
  }

  async guardar(p: PrecioArticulo): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO precio_articulo (articulo_id, lista_id, modo, precio_manual_cent, margen_utilidad)
       VALUES (?,?,?,?,?)
       ON CONFLICT(articulo_id, lista_id) DO UPDATE SET
         modo=excluded.modo, precio_manual_cent=excluded.precio_manual_cent, margen_utilidad=excluded.margen_utilidad`,
      [
        p.articuloId,
        p.listaId,
        p.modo,
        p.precioManual?.aCentavos() ?? null,
        p.margenUtilidad !== undefined ? String(p.margenUtilidad) : null,
      ],
    );
  }
}

export class RepositorioExistenciasSqlite implements RepositorioExistencias {
  constructor(private readonly db: EjecutorSql) {}

  async obtener(articuloId: string, depositoId: string): Promise<Existencia | undefined> {
    const filas = await this.db.consultar(
      "SELECT * FROM existencia WHERE articulo_id = ? AND deposito_id = ?",
      [articuloId, depositoId],
    );
    const fila = filas[0];
    return fila ? filaAExistencia(fila) : undefined;
  }

  async guardar(e: Existencia): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO existencia (articulo_id, deposito_id, cantidad, stock_minimo)
       VALUES (?,?,?,?)
       ON CONFLICT(articulo_id, deposito_id) DO UPDATE SET
         cantidad=excluded.cantidad, stock_minimo=excluded.stock_minimo`,
      [e.articuloId, e.depositoId, e.cantidad.aDecimalString(3), e.stockMinimo.aDecimalString(3)],
    );
  }
}

export class RepositorioMovimientosSqlite implements RepositorioMovimientos {
  constructor(private readonly db: EjecutorSql) {}

  async agregar(m: MovimientoDeStock): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO movimiento_stock (id, articulo_id, deposito_id, tipo, cantidad, fecha, motivo, referencia)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        m.id,
        m.articuloId,
        m.depositoId,
        m.tipo,
        m.cantidad.aDecimalString(3),
        m.fecha.toISOString(),
        m.motivo ?? null,
        m.referencia ?? null,
      ],
    );
  }
}

export class RepositorioVentasSqlite implements RepositorioVentas {
  constructor(private readonly db: EjecutorSql) {}

  async siguienteNumero(puntoDeVenta: number, tipo: TipoComprobante): Promise<number> {
    const filas = await this.db.consultar<{ n: number }>(
      "SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM venta WHERE punto_de_venta = ? AND tipo_comprobante = ?",
      [puntoDeVenta, tipo],
    );
    return Number(filas[0]?.n ?? 1);
  }

  async actualizarCae(venta: VentaConfirmada): Promise<void> {
    await this.db.ejecutar(
      "UPDATE venta SET estado_cae = ?, cae = ?, vencimiento_cae = ? WHERE id = ?",
      [venta.estadoCae, venta.cae ?? null, venta.vencimientoCae?.toISOString() ?? null, venta.id],
    );
  }

  async guardar(v: VentaConfirmada): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO venta (id, fecha, punto_de_venta, numero, tipo_comprobante, estado_cae, cliente_id, neto_gravado_cent, iva_cent, total_cent, vuelto_cent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        v.id,
        v.fecha.toISOString(),
        v.puntoDeVenta,
        v.numero,
        v.tipoComprobante,
        v.estadoCae,
        v.clienteId ?? null,
        v.resultado.netoGravado.aCentavos(),
        v.resultado.iva.aCentavos(),
        v.resultado.total.aCentavos(),
        v.vuelto.aCentavos(),
      ],
    );

    for (let i = 0; i < v.items.length; i++) {
      const item = v.items[i];
      const linea = v.resultado.lineas[i];
      if (item === undefined || linea === undefined) continue;
      await this.db.ejecutar(
        `INSERT INTO item_venta (id, venta_id, articulo_id, descripcion, cantidad, precio_unitario_cent, alicuota_iva, descuento_porcentaje, importe_cent)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          nuevoId(),
          v.id,
          item.articuloId,
          item.descripcion,
          item.cantidad.aDecimalString(3),
          item.precioUnitario.aCentavos(),
          String(item.alicuota.porcentaje),
          item.descuentoPorcentaje !== undefined ? String(item.descuentoPorcentaje) : null,
          linea.importe.aCentavos(),
        ],
      );
    }

    for (const pago of v.pagos) {
      await this.db.ejecutar(
        "INSERT INTO pago (id, venta_id, forma, monto_cent, referencia) VALUES (?,?,?,?,?)",
        [nuevoId(), v.id, pago.forma, pago.monto.aCentavos(), pago.referencia ?? null],
      );
    }
  }
}

/** Guarda (alta/actualización) un depósito. */
export async function guardarDeposito(db: EjecutorSql, d: Deposito): Promise<void> {
  await db.ejecutar(
    `INSERT INTO deposito (id, nombre, sucursal_id) VALUES (?,?,?)
     ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, sucursal_id=excluded.sucursal_id`,
    [d.id, d.nombre, d.sucursalId ?? null],
  );
}

/** Guarda (alta/actualización) una lista de precios. */
export async function guardarLista(db: EjecutorSql, l: ListaDePrecios): Promise<void> {
  await db.ejecutar(
    `INSERT INTO lista_precios (id, nombre, tipo, predeterminada) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, tipo=excluded.tipo, predeterminada=excluded.predeterminada`,
    [l.id, l.nombre, l.tipo, bool01(l.predeterminada)],
  );
}

export interface RepositoriosSqlite extends Repositorios {
  readonly articulos: RepositorioArticulosSqlite;
  readonly precios: RepositorioPreciosSqlite;
  readonly existencias: RepositorioExistenciasSqlite;
  readonly movimientos: RepositorioMovimientosSqlite;
  readonly ventas: RepositorioVentasSqlite;
}

/** Arma los repositorios SQLite sobre un `EjecutorSql`. */
export function crearRepositoriosSqlite(db: EjecutorSql): RepositoriosSqlite {
  return {
    articulos: new RepositorioArticulosSqlite(db),
    precios: new RepositorioPreciosSqlite(db),
    existencias: new RepositorioExistenciasSqlite(db),
    movimientos: new RepositorioMovimientosSqlite(db),
    ventas: new RepositorioVentasSqlite(db),
  };
}
