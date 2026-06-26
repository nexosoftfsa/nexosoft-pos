/**
 * `ServicioDeFacturacion`: orquesta lo fiscal sobre una venta ya cerrada.
 *  - `autorizar`: pide el CAE a `ServicioFiscal` y persiste el resultado
 *    (`PENDIENTE_CAE → AUTORIZADA | RECHAZADA`). Es el paso "online" del flujo
 *    offline-first (se vende e imprime sin red; el CAE se pide cuando hay conexión).
 *  - `emitirNotaCredito` / `emitirNotaDebito`: generan la nota (letra heredada de la
 *    factura, comprobante asociado) lista para autorizar.
 *
 * Depende del puerto `ServicioFiscal` (mock o ARCA real), nunca de SOAP.
 */
import {
  calcularComprobante,
  Cantidad,
  ErrorDominio,
  ErrorFiscal,
  EstadoCae,
  Money,
  notaCreditoPara,
  notaDebitoPara,
  nuevoId,
  requiereCae,
  type LineaVenta,
  type TipoComprobante,
} from "@nexosoft/domain";
import {
  construirSolicitudCae,
  DocTipo,
  type ComprobanteAsociado,
  type ServicioFiscal,
} from "@nexosoft/fiscal";

import type { ConfiguracionComercio } from "../config/configuracion-comercio.js";
import type { Repositorios } from "../puertos/repositorios.js";
import type { ItemVenta, VentaConfirmada } from "./venta.js";

export interface DatosReceptorDoc {
  readonly docTipo: DocTipo;
  readonly docNumero: string;
}

const CONSUMIDOR_FINAL: DatosReceptorDoc = {
  docTipo: DocTipo.ConsumidorFinal,
  docNumero: "0",
};

function itemsALineas(items: readonly ItemVenta[]): LineaVenta[] {
  return items.map((it) => ({
    descripcion: it.descripcion,
    cantidad: it.cantidad.aDecimalString(3),
    precioUnitario: it.precioUnitario,
    alicuota: it.alicuota,
    ...(it.descuentoPorcentaje !== undefined
      ? { descuentoPorcentaje: it.descuentoPorcentaje }
      : {}),
  }));
}

function lineasAItems(lineas: readonly LineaVenta[]): ItemVenta[] {
  return lineas.map((l) => ({
    articuloId: "",
    descripcion: l.descripcion,
    cantidad: Cantidad.de(String(l.cantidad)),
    precioUnitario: l.precioUnitario,
    alicuota: l.alicuota,
    ...(l.descuentoPorcentaje !== undefined ? { descuentoPorcentaje: l.descuentoPorcentaje } : {}),
  }));
}

export class ServicioDeFacturacion {
  constructor(
    private readonly repos: Repositorios,
    private readonly config: ConfiguracionComercio,
    private readonly fiscal: ServicioFiscal,
  ) {}

  /**
   * Solicita el CAE de un comprobante pendiente y persiste el resultado.
   * @throws {ErrorFiscal} si el comprobante no está pendiente de CAE.
   */
  async autorizar(
    venta: VentaConfirmada,
    receptor: DatosReceptorDoc = CONSUMIDOR_FINAL,
  ): Promise<VentaConfirmada> {
    if (venta.estadoCae !== EstadoCae.PendienteCae) {
      throw new ErrorFiscal(
        "VENTA_NO_PENDIENTE",
        `El comprobante ${venta.id} no está pendiente de CAE (estado: ${venta.estadoCae}).`,
      );
    }

    const solicitud = construirSolicitudCae(
      venta.resultado,
      {
        puntoDeVenta: venta.puntoDeVenta,
        numero: venta.numero,
        fecha: venta.fecha,
        ...(venta.comprobantesAsociados !== undefined
          ? { comprobantesAsociados: venta.comprobantesAsociados }
          : {}),
      },
      {
        condicionIva: venta.condicionIvaReceptor,
        docTipo: receptor.docTipo,
        docNumero: receptor.docNumero,
      },
    );

    const r = await this.fiscal.solicitarCae(solicitud);
    const actualizada: VentaConfirmada =
      r.estado === EstadoCae.Autorizada
        ? {
            ...venta,
            estadoCae: EstadoCae.Autorizada,
            ...(r.cae !== undefined ? { cae: r.cae } : {}),
            ...(r.vencimientoCae !== undefined ? { vencimientoCae: r.vencimientoCae } : {}),
          }
        : { ...venta, estadoCae: EstadoCae.Rechazada };

    await this.repos.ventas.actualizarCae(actualizada);
    return actualizada;
  }

  /** Nota de Crédito que anula totalmente una venta (mismos ítems e importe). */
  async emitirNotaCredito(ventaOriginal: VentaConfirmada): Promise<VentaConfirmada> {
    return this.emitirNota(
      ventaOriginal,
      notaCreditoPara(ventaOriginal.tipoComprobante),
      ventaOriginal.items,
      itemsALineas(ventaOriginal.items),
    );
  }

  /** Nota de Débito por cargos adicionales (intereses, recargos) sobre una venta. */
  async emitirNotaDebito(
    ventaOriginal: VentaConfirmada,
    lineas: readonly LineaVenta[],
  ): Promise<VentaConfirmada> {
    if (lineas.length === 0) {
      throw new ErrorDominio(
        "NOTA_DEBITO_SIN_LINEAS",
        "La Nota de Débito necesita al menos un concepto.",
      );
    }
    return this.emitirNota(
      ventaOriginal,
      notaDebitoPara(ventaOriginal.tipoComprobante),
      lineasAItems(lineas),
      lineas,
    );
  }

  private async emitirNota(
    ventaOriginal: VentaConfirmada,
    tipo: TipoComprobante,
    items: readonly ItemVenta[],
    lineas: readonly LineaVenta[],
  ): Promise<VentaConfirmada> {
    const resultado = calcularComprobante(lineas, {
      tipo,
      preciosIncluyenIva: this.config.preciosIncluyenIva,
    });
    const numero = await this.repos.ventas.siguienteNumero(this.config.puntoDeVenta, tipo);
    const asociado: ComprobanteAsociado = {
      tipo: ventaOriginal.tipoComprobante,
      puntoDeVenta: ventaOriginal.puntoDeVenta,
      numero: ventaOriginal.numero,
    };
    const nota: VentaConfirmada = {
      id: nuevoId(),
      fecha: new Date(),
      puntoDeVenta: this.config.puntoDeVenta,
      numero,
      tipoComprobante: tipo,
      condicionIvaReceptor: ventaOriginal.condicionIvaReceptor,
      estadoCae: requiereCae(tipo) ? EstadoCae.PendienteCae : EstadoCae.Borrador,
      items,
      resultado,
      pagos: [],
      vuelto: Money.cero(),
      comprobantesAsociados: [asociado],
      ...(ventaOriginal.clienteId !== undefined ? { clienteId: ventaOriginal.clienteId } : {}),
    };
    await this.repos.ventas.guardar(nota);
    return nota;
  }
}
