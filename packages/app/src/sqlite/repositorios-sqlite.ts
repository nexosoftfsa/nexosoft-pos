/**
 * Adaptador SQLite de los repositorios (implementa los puertos de
 * `puertos/repositorios.ts` sobre un `EjecutorSql`). Mismo SQL para el POS
 * (Tauri) y para los tests (node:sqlite). El dinero se guarda en centavos y las
 * cantidades como texto (ver `mapeo.ts`).
 */
import {
  Cantidad,
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
  ComponenteDeCombo,
  RepositorioArticulos,
  RepositorioCombos,
  RepositorioExistencias,
  RepositorioMovimientos,
  RepositorioPrecios,
  RepositorioVentas,
  Repositorios,
  ResueltoPorElServidor,
  VentaLocal,
} from "../puertos/repositorios.js";
import type { VentaConfirmada } from "../ventas/venta.js";
import type { EjecutorSql, Fila } from "./ejecutor-sql.js";
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

  /** Ids de los artículos vendibles hoy. Lo usa el pull para detectar bajas. */
  async idsActivos(): Promise<string[]> {
    const filas = await this.db.consultar<{ id: string }>(
      "SELECT id FROM articulo WHERE activo = 1",
    );
    return filas.map((f) => f.id);
  }

  /**
   * Da de baja artículos por id. **No los borra**: siguen referenciados por
   * ventas locales y por operaciones que todavía están en la cola de sync.
   *
   * Se manda de a tandas porque SQLite tiene un tope de parámetros por
   * sentencia, y un catálogo importado puede tener miles de artículos.
   */
  async desactivar(ids: readonly string[]): Promise<void> {
    const TANDA = 400;
    for (let i = 0; i < ids.length; i += TANDA) {
      const tanda = ids.slice(i, i + TANDA);
      await this.db.ejecutar(
        `UPDATE articulo SET activo = 0 WHERE id IN (${tanda.map(() => "?").join(",")})`,
        [...tanda],
      );
    }
  }

  /**
   * Fase 17: toggle local de la estrella "grilla rápida" — a propósito no
   * pasa por `guardar()` (el upsert de sync), así un catálogo que llega de
   * nuevo por sync nunca pisa esta marca puramente local.
   */
  async establecerGrillaRapida(id: string, valor: boolean): Promise<void> {
    await this.db.ejecutar(`UPDATE articulo SET mostrar_en_grilla_rapida = ? WHERE id = ?`, [
      bool01(valor),
      id,
    ]);
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

export class RepositorioCombosSqlite implements RepositorioCombos {
  constructor(private readonly db: EjecutorSql) {}

  async componentesDe(articuloId: string): Promise<readonly ComponenteDeCombo[]> {
    const filas = await this.db.consultar<{ componente_id: string; cantidad: string }>(
      "SELECT componente_id, cantidad FROM combo_componente WHERE combo_id = ? ORDER BY componente_id",
      [articuloId],
    );
    return filas.map((f) => ({ articuloId: f.componente_id, cantidad: Cantidad.de(f.cantidad) }));
  }

  /** Reemplaza el set de componentes de un combo (lo usa el pull del catálogo). */
  async reemplazar(comboId: string, componentes: readonly ComponenteDeCombo[]): Promise<void> {
    await this.db.ejecutar("DELETE FROM combo_componente WHERE combo_id = ?", [comboId]);
    for (const c of componentes) {
      await this.db.ejecutar(
        "INSERT INTO combo_componente (combo_id, componente_id, cantidad) VALUES (?,?,?)",
        [comboId, c.articuloId, c.cantidad.aDecimalString(3)],
      );
    }
  }
}

type FilaVenta = Fila & {
  id: string;
  fecha: string;
  punto_de_venta: number;
  numero: number;
  numero_fiscal: number | null;
  tipo_comprobante: string;
  estado_cae: string;
  cae: string | null;
  vencimiento_cae: string | null;
  total_cent: number;
};

type FilaItem = Fila & {
  venta_id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario_cent: number;
  importe_cent: number;
};

type FilaPago = Fila & {
  venta_id: string;
  forma: string;
  monto_cent: number;
};

/**
 * `estadoFiscal` del servidor → `estado_cae` de la terminal. Son dos
 * vocabularios distintos y la columna local tiene un CHECK: mandarle
 * "AUTORIZADA" está bien, pero "PENDIENTE" o "NO_APLICA" romperían el INSERT.
 */
function estadoCaeLocal(estadoFiscal: string): string {
  if (estadoFiscal === "AUTORIZADA") return "AUTORIZADA";
  if (estadoFiscal === "RECHAZADA") return "RECHAZADA";
  if (estadoFiscal === "NO_APLICA") return "BORRADOR";
  return "PENDIENTE_CAE";
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

  async vincularOperacion(ventaId: string, operacionId: string): Promise<void> {
    await this.db.ejecutar("UPDATE venta SET operacion_id = ? WHERE id = ?", [
      operacionId,
      ventaId,
    ]);
  }

  /**
   * El número de ARCA va a `numero_fiscal`, **nunca pisa `numero`**: son dos
   * series distintas sobre la misma tabla, y `numero` tiene un UNIQUE por
   * (punto de venta, tipo, número) que se rompería —el correlativo local va muy
   * por delante del fiscal, así que el número de ARCA suele estar ya ocupado
   * por otra venta vieja de la terminal.
   */
  async aplicarResueltoPorElServidor(
    operacionId: string,
    r: ResueltoPorElServidor,
  ): Promise<void> {
    await this.db.ejecutar(
      `UPDATE venta
          SET numero_fiscal = COALESCE(?, numero_fiscal),
              tipo_comprobante = COALESCE(?, tipo_comprobante),
              cae = COALESCE(?, cae),
              vencimiento_cae = COALESCE(?, vencimiento_cae),
              estado_cae = ?
        WHERE operacion_id = ?`,
      [
        r.numeroFiscal,
        r.tipoComprobante,
        r.cae,
        r.vencimientoCae?.toISOString() ?? null,
        estadoCaeLocal(r.estadoFiscal),
        operacionId,
      ],
    );
  }

  async ultimas(limite: number): Promise<readonly VentaLocal[]> {
    const ventas = await this.db.consultar<FilaVenta>(
      `SELECT id, fecha, punto_de_venta, numero, numero_fiscal, tipo_comprobante, estado_cae,
              cae, vencimiento_cae, total_cent
         FROM venta
        ORDER BY fecha DESC
        LIMIT ?`,
      [limite],
    );
    if (ventas.length === 0) return [];

    // Una consulta para todos los ítems y otra para todos los pagos: con una
    // por venta, abrir Comprobantes con 200 filas serían 400 consultas.
    const ids = ventas.map((v) => v.id);
    const marcas = ids.map(() => "?").join(",");
    const items = await this.db.consultar<FilaItem>(
      `SELECT venta_id, descripcion, cantidad, precio_unitario_cent, importe_cent
         FROM item_venta WHERE venta_id IN (${marcas})`,
      ids,
    );
    const pagos = await this.db.consultar<FilaPago>(
      `SELECT venta_id, forma, monto_cent FROM pago WHERE venta_id IN (${marcas})`,
      ids,
    );

    return ventas.map((v) => ({
      id: v.id,
      fecha: new Date(v.fecha),
      puntoDeVenta: Number(v.punto_de_venta),
      numero: Number(v.numero),
      numeroFiscal: v.numero_fiscal === null ? null : Number(v.numero_fiscal),
      tipoComprobante: v.tipo_comprobante,
      estadoCae: v.estado_cae,
      cae: v.cae,
      vencimientoCae: v.vencimiento_cae === null ? null : new Date(v.vencimiento_cae),
      totalCentavos: Number(v.total_cent),
      descuentoCentavos: 0,
      items: items
        .filter((i) => i.venta_id === v.id)
        .map((i) => ({
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitarioCentavos: Number(i.precio_unitario_cent),
          importeCentavos: Number(i.importe_cent),
        })),
      pagos: pagos
        .filter((p) => p.venta_id === v.id)
        .map((p) => ({ forma: p.forma, montoCentavos: Number(p.monto_cent) })),
    }));
  }

  async guardar(v: VentaConfirmada): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO venta (id, fecha, punto_de_venta, numero, tipo_comprobante, estado_cae, cliente_id, neto_gravado_cent, iva_cent, total_cent, vuelto_cent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      // `numero_fiscal` queda en null a propósito: hasta que ARCA no autorice,
      // el único número que existe es el correlativo local.
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
        `INSERT INTO item_venta (id, venta_id, articulo_id, descripcion, cantidad, precio_unitario_cent, alicuota_iva, descuento_porcentaje, importe_cent, costo_neto_cent)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
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
          item.costoNeto.aCentavos(),
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
  readonly combos: RepositorioCombosSqlite;
}

/** Arma los repositorios SQLite sobre un `EjecutorSql`. */
export function crearRepositoriosSqlite(db: EjecutorSql): RepositoriosSqlite {
  return {
    articulos: new RepositorioArticulosSqlite(db),
    precios: new RepositorioPreciosSqlite(db),
    existencias: new RepositorioExistenciasSqlite(db),
    movimientos: new RepositorioMovimientosSqlite(db),
    ventas: new RepositorioVentasSqlite(db),
    combos: new RepositorioCombosSqlite(db),
  };
}
