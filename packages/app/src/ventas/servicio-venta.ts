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
  TipoMovimiento,
  type Cantidad,
  type CondicionIva,
  type FormaDePago,
  type LineaVenta,
  type Money,
  type Pago,
  type ResultadoCobro,
  type ResultadoComprobante,
  type TipoComprobante,
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
    // Validar stock ANTES de persistir nada.
    for (const item of items) {
      const existencia =
        (await this.repos.existencias.obtener(item.articuloId, depositoId)) ??
        crearExistencia({ articuloId: item.articuloId, depositoId });
      if (!this.config.permitirStockNegativo && !hayStockSuficiente(existencia, item.cantidad)) {
        throw new ErrorStock("STOCK_INSUFICIENTE", `Stock insuficiente de "${item.descripcion}".`);
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

    // Descuento de stock: un movimiento de venta por ítem.
    for (const item of items) {
      const movimiento = crearMovimiento({
        articuloId: item.articuloId,
        depositoId,
        tipo: TipoMovimiento.Venta,
        cantidad: item.cantidad,
        referencia: venta.id,
        fecha: venta.fecha,
      });
      await this.repos.movimientos.agregar(movimiento);
      const existencia =
        (await this.repos.existencias.obtener(item.articuloId, depositoId)) ??
        crearExistencia({ articuloId: item.articuloId, depositoId });
      const actualizada = aplicarMovimiento(existencia, movimiento, {
        permitirNegativo: this.config.permitirStockNegativo,
      });
      await this.repos.existencias.guardar(actualizada);
    }

    return venta;
  }

  // --- Interno --------------------------------------------------------------

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

    const tipoComprobante = resolverTipoComprobante(
      this.config.condicionIvaEmisor,
      comando.condicionReceptor,
    );
    const resultado = calcularComprobante(lineas, {
      tipo: tipoComprobante,
      preciosIncluyenIva: this.config.preciosIncluyenIva,
      ...(comando.descuentoPorcentaje !== undefined
        ? { descuentoPorcentaje: comando.descuentoPorcentaje }
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
