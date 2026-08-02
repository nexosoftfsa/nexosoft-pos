/**
 * `ServicioDeVenta`: caso de uso central del POS. Arma una venta a partir del
 * catálogo (resuelve precios), calcula el comprobante y el cobro con el dominio,
 * y al confirmar **persiste la venta y descuenta el stock**.
 *
 * Orquesta `@nexosoft/domain` (cálculo) sobre los puertos de persistencia
 * (`Repositorios`). No conoce SQLite ni Tauri: eso lo aporta el adaptador.
 *
 * Atomicidad: en memoria los pasos se aplican en orden (validando stock antes de
 * persistir). El adaptador SQLite (1.4b) debe envolver `confirmarVenta` en una
 * transacción para que venta + movimientos + existencias se guarden juntos.
 */
import {
  aplicarMovimiento,
  calcularCobro,
  calcularComprobante,
  crearExistencia,
  crearMovimiento,
  EstadoCae,
  ErrorDominio,
  ErrorPago,
  ErrorStock,
  hayStockSuficiente,
  nuevoId,
  permiteCantidadFraccionada,
  requiereCae,
  resolverPrecioArticulo,
  resolverTipoComprobante,
  TipoComprobante,
  TipoMovimiento,
  type Cantidad,
  type CondicionIva,
  type FormaDePago,
  type LineaVenta,
  type Money,
  type Pago,
  type ResultadoCobro,
  type ResultadoComprobante,
} from "@nexosoft/domain";

import type { ConfiguracionComercio } from "../config/configuracion-comercio.js";
import type { Repositorios } from "../puertos/repositorios.js";
import type { ItemVenta, VentaConfirmada } from "./venta.js";

export interface ItemVentaComando {
  readonly articuloId: string;
  readonly cantidad: Cantidad;
  readonly descuentoPorcentaje?: number;
}

export interface PagoComando {
  readonly forma: FormaDePago;
  readonly monto: Money;
  readonly referencia?: string;
}

export interface ComandoVenta {
  readonly items: readonly ItemVentaComando[];
  readonly condicionReceptor: CondicionIva;
  readonly pagos: readonly PagoComando[];
  readonly descuentoPorcentaje?: number;
  readonly recargoPorcentaje?: number;
  readonly clienteId?: string;
}

export interface PrevisualizacionVenta {
  readonly tipoComprobante: TipoComprobante;
  readonly items: readonly ItemVenta[];
  readonly resultado: ResultadoComprobante;
  readonly cobro: ResultadoCobro;
}

export class ServicioDeVenta {
  constructor(
    private readonly repos: Repositorios,
    private readonly config: ConfiguracionComercio,
  ) {}

  /** Arma la venta y calcula totales/cobro SIN persistir (para mostrar en pantalla). */
  async previsualizarVenta(comando: ComandoVenta): Promise<PrevisualizacionVenta> {
    const { tipoComprobante, items, resultado, cobro } = await this.armar(comando);
    return { tipoComprobante, items, resultado, cobro };
  }

  /**
   * Confirma la venta: valida cobro y stock, persiste la venta (estado
   * `PENDIENTE_CAE` para comprobantes fiscales) y descuenta el stock.
   *
   * @throws {ErrorPago} si el cobro no cubre el total (cuenta corriente aún no
   *   disponible).
   * @throws {ErrorStock} si falta stock y no se permite negativo.
   */
  async confirmarVenta(comando: ComandoVenta): Promise<VentaConfirmada> {
    const { tipoComprobante, items, resultado, cobro, pagos } = await this.armar(comando);

    if (!cobro.cancelada) {
      throw new ErrorPago(
        "VENTA_NO_CANCELADA",
        `Falta cubrir ${cobro.saldoPendiente.aDecimalString()}; la cuenta corriente aún no está disponible.`,
      );
    }

    const depositoId = this.config.depositoPorDefectoId;
    // Un combo no tiene stock propio: se descuenta el de sus componentes. Por eso
    // resolvemos los movimientos de stock reales (expandiendo combos) antes de
    // validar y de descontar (Fase 8.1.b, ADR-0033).
    const movimientosStock = await this.resolverMovimientosDeStock(items);

    // Validar stock ANTES de persistir nada.
    for (const m of movimientosStock) {
      const existencia =
        (await this.repos.existencias.obtener(m.articuloId, depositoId)) ??
        crearExistencia({ articuloId: m.articuloId, depositoId });
      if (!this.config.permitirStockNegativo && !hayStockSuficiente(existencia, m.cantidad)) {
        throw new ErrorStock("STOCK_INSUFICIENTE", `Stock insuficiente de "${m.descripcion}".`);
      }
    }

    const numero = await this.repos.ventas.siguienteNumero(
      this.config.puntoDeVenta,
      tipoComprobante,
    );
    const venta: VentaConfirmada = {
      id: nuevoId(),
      fecha: new Date(),
      puntoDeVenta: this.config.puntoDeVenta,
      numero,
      tipoComprobante,
      condicionIvaReceptor: comando.condicionReceptor,
      estadoCae: requiereCae(tipoComprobante) ? EstadoCae.PendienteCae : EstadoCae.Borrador,
      items,
      resultado,
      pagos,
      vuelto: cobro.vuelto,
      ...(comando.clienteId !== undefined ? { clienteId: comando.clienteId } : {}),
    };
    await this.repos.ventas.guardar(venta);

    // Descuento de stock: un movimiento de venta por cada componente (los combos
    // ya vienen expandidos en `movimientosStock`).
    for (const m of movimientosStock) {
      const movimiento = crearMovimiento({
        articuloId: m.articuloId,
        depositoId,
        tipo: TipoMovimiento.Venta,
        cantidad: m.cantidad,
        referencia: venta.id,
        fecha: venta.fecha,
      });
      await this.repos.movimientos.agregar(movimiento);
      const existencia =
        (await this.repos.existencias.obtener(m.articuloId, depositoId)) ??
        crearExistencia({ articuloId: m.articuloId, depositoId });
      const actualizada = aplicarMovimiento(existencia, movimiento, {
        permitirNegativo: this.config.permitirStockNegativo,
      });
      await this.repos.existencias.guardar(actualizada);
    }

    return venta;
  }

  // --- Interno --------------------------------------------------------------

  /**
   * Traduce los ítems de la venta a movimientos de stock a nivel de artículo
   * físico. Un ítem simple se mueve a sí mismo; un ítem COMBO se expande a sus
   * componentes (`cantidad_ítem × cantidad_componente`). Sin `repos.combos`
   * configurado, todo se trata como simple.
   */
  private async resolverMovimientosDeStock(
    items: readonly ItemVenta[],
  ): Promise<Array<{ articuloId: string; cantidad: Cantidad; descripcion: string }>> {
    const salida: Array<{ articuloId: string; cantidad: Cantidad; descripcion: string }> = [];
    for (const item of items) {
      const componentes = this.repos.combos
        ? await this.repos.combos.componentesDe(item.articuloId)
        : [];
      if (componentes.length === 0) {
        salida.push({
          articuloId: item.articuloId,
          cantidad: item.cantidad,
          descripcion: item.descripcion,
        });
        continue;
      }
      for (const componente of componentes) {
        const articulo = await this.repos.articulos.obtener(componente.articuloId);
        salida.push({
          articuloId: componente.articuloId,
          cantidad: item.cantidad.multiplicarPor(componente.cantidad.aDecimalString(3)),
          descripcion: articulo?.descripcion ?? componente.articuloId,
        });
      }
    }
    return salida;
  }

  private async armar(comando: ComandoVenta): Promise<{
    tipoComprobante: TipoComprobante;
    items: ItemVenta[];
    resultado: ResultadoComprobante;
    cobro: ResultadoCobro;
    pagos: Pago[];
  }> {
    if (comando.items.length === 0) {
      throw new ErrorDominio("VENTA_SIN_ITEMS", "La venta no tiene ítems.");
    }

    const items: ItemVenta[] = [];
    const lineas: LineaVenta[] = [];

    for (const entrada of comando.items) {
      if (!entrada.cantidad.esPositiva()) {
        throw new ErrorDominio("CANTIDAD_INVALIDA", "La cantidad de cada ítem debe ser positiva.");
      }
      const articulo = await this.repos.articulos.obtener(entrada.articuloId);
      if (articulo === undefined) {
        throw new ErrorDominio(
          "ARTICULO_INEXISTENTE",
          `No existe el artículo ${entrada.articuloId}.`,
        );
      }
      if (!articulo.activo) {
        throw new ErrorDominio(
          "ARTICULO_INACTIVO",
          `El artículo "${articulo.descripcion}" está inactivo.`,
        );
      }
      if (!permiteCantidadFraccionada(articulo.unidadDeMedida) && !entrada.cantidad.esEntera()) {
        throw new ErrorDominio(
          "CANTIDAD_NO_ENTERA",
          `"${articulo.descripcion}" se vende por unidad: la cantidad debe ser entera.`,
        );
      }

      const precio = await this.repos.precios.obtener(
        entrada.articuloId,
        this.config.listaPredeterminadaId,
      );
      if (precio === undefined) {
        throw new ErrorDominio(
          "SIN_PRECIO",
          `El artículo "${articulo.descripcion}" no tiene precio en la lista por defecto.`,
        );
      }
      const precioUnitario = resolverPrecioArticulo(precio, articulo, {
        condicionEmisor: this.config.condicionIvaEmisor,
      });

      items.push({
        articuloId: articulo.id,
        descripcion: articulo.descripcion,
        cantidad: entrada.cantidad,
        precioUnitario,
        alicuota: articulo.alicuotaIva,
        ...(entrada.descuentoPorcentaje !== undefined
          ? { descuentoPorcentaje: entrada.descuentoPorcentaje }
          : {}),
      });
      lineas.push({
        descripcion: articulo.descripcion,
        cantidad: entrada.cantidad.aDecimalString(3),
        precioUnitario,
        alicuota: articulo.alicuotaIva,
        ...(entrada.descuentoPorcentaje !== undefined
          ? { descuentoPorcentaje: entrada.descuentoPorcentaje }
          : {}),
      });
    }

    // Fase 10.1: sin alta en ARCA, toda venta es un ticket sin valor fiscal —
    // no se resuelve A/B/C según emisor/receptor (ADR-0041).
    const tipoComprobante =
      this.config.emiteComprobantesFiscales === false
        ? TipoComprobante.TicketNoFiscal
        : resolverTipoComprobante(this.config.condicionIvaEmisor, comando.condicionReceptor);
    const resultado = calcularComprobante(lineas, {
      tipo: tipoComprobante,
      preciosIncluyenIva: this.config.preciosIncluyenIva,
      ...(comando.descuentoPorcentaje !== undefined
        ? { descuentoPorcentaje: comando.descuentoPorcentaje }
        : {}),
      ...(comando.recargoPorcentaje !== undefined
        ? { recargoPorcentaje: comando.recargoPorcentaje }
        : {}),
    });

    const pagos = comando.pagos.map((p) => ({
      forma: p.forma,
      monto: p.monto,
      ...(p.referencia !== undefined ? { referencia: p.referencia } : {}),
    }));
    const cobro = calcularCobro(resultado.total, pagos);

    return { tipoComprobante, items, resultado, cobro, pagos };
  }
}
