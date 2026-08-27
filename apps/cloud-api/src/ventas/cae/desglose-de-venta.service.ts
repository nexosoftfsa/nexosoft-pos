import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  desglosarIvaIncluido,
  desgloseSinDiscriminar,
  letraDe,
  Money,
  type DesgloseIva,
  type TipoComprobante,
} from '@nexosoft/domain';

import { PrismaService } from '../../prisma/prisma.service';
import { ajustarAlTotal, alicuotaDeTipoIva } from './iva-de-producto';
import { receptorArca, RECEPTOR_CONSUMIDOR_FINAL, type ReceptorArca } from './receptor-arca';

/** Lo mínimo que hace falta de cada línea para desglosar. */
export interface LineaDeVenta {
  readonly productoId: string;
  readonly subtotal: Decimal;
}

/**
 * Separa neto e IVA para el pedido del CAE.
 *
 * Los precios del comercio minorista son finales (IVA incluido) y ARCA pide las
 * dos cosas por separado, con las cuentas cerrando al centavo. La tasa de cada
 * línea sale del producto: es el servidor el que la sabe, no se le cree al
 * cliente.
 *
 * Vive en un servicio propio —y no adentro de `VentasService`— porque lo
 * necesitan los dos caminos hacia ARCA: la venta del momento y el reintento de
 * las que quedaron pendientes. Si el reintento mandara sólo el total, ARCA
 * recibiría una factura con IVA en cero.
 */
@Injectable()
export class DesgloseDeVentaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Desglosa a partir de los ítems que se están por guardar. */
  async deLineas(
    items: readonly LineaDeVenta[],
    tipoComprobante: string,
    total: Decimal,
  ): Promise<DesgloseIva> {
    const totalMoney = Money.desde(total.toFixed(2));
    // En un comprobante C no se discrimina: mandarlo discriminado es rechazo.
    if (letraDe(tipoComprobante as TipoComprobante) === 'C') {
      return desgloseSinDiscriminar(totalMoney);
    }

    const ids = [...new Set(items.map((i) => i.productoId))];
    const productos =
      ids.length > 0
        ? await this.prisma.producto.findMany({
            where: { id: { in: ids } },
            select: { id: true, tipoIva: true },
          })
        : [];
    const ivaPorProducto = new Map(productos.map((p) => [p.id, p.tipoIva]));

    // El descuento y el recargo globales se reparten proporcionalmente entre
    // las líneas: si no, la suma del desglose no daría el total y ARCA lo
    // rechazaría.
    const bruto = items.reduce((a, i) => a.add(i.subtotal), new Decimal(0));
    const factor = bruto.isZero() ? new Decimal(1) : total.div(bruto);

    const lineas = items.map((i) => ({
      importe: Money.desde(i.subtotal.mul(factor).toFixed(2)),
      alicuota: alicuotaDeTipoIva(ivaPorProducto.get(i.productoId)),
    }));

    // El prorrateo puede dejar unos centavos de diferencia contra el total
    // real; se corrigen para que ARCA no rechace.
    return ajustarAlTotal(desglosarIvaIncluido(lineas), totalMoney);
  }

  /**
   * Datos del comprador para ARCA.
   *
   * Sin cliente asociado la venta es a consumidor final, que es el caso normal
   * del mostrador.
   */
  async receptorDe(clienteId: string | null): Promise<ReceptorArca> {
    if (clienteId === null) return RECEPTOR_CONSUMIDOR_FINAL;
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { documento: true, condicionIva: true },
    });
    return receptorArca(cliente?.documento, cliente?.condicionIva);
  }

  /** Desglosa una venta ya guardada, releyendo sus ítems. */
  async deVentaGuardada(ventaId: string, tipoComprobante: string, total: Decimal) {
    const items = await this.prisma.itemVenta.findMany({
      where: { ventaId },
      select: { productoId: true, subtotal: true },
    });
    return this.deLineas(items, tipoComprobante, total);
  }
}
