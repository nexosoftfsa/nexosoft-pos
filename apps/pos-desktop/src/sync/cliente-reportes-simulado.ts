/**
 * Adaptador EN MEMORIA de reportes, para el modo demo y el desarrollo en el
 * navegador.
 *
 * Antes devolvía números fijos escritos a mano: no cambiaban al mover el
 * rango, no tenían relación con el catálogo y el "top de productos" nombraba
 * artículos que no existían. Ahora agrega sobre las ventas ficticias de
 * `ventas-demo.ts` — 30 días de historia sobre los 711 artículos del catálogo
 * demo — así que el demo se comporta como el sistema real: cambiar el período
 * cambia los números, y los totales cierran entre pantallas.
 */
import type { RangoFechas } from "../componentes/reportes-helpers";
import { ventasEntre, type VentaDemo } from "../datos/ventas-demo";
import type {
  ClienteReportes,
  LineaDetalleVenta,
  PuntoSerie,
  Rentabilidad,
  ResumenVentas,
  TopProducto,
  VentaPorMedio,
  VentaPorRubro,
} from "./cliente-reportes";

const dosDecimales = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** Suma por clave, devolviendo las entradas ordenadas de mayor a menor. */
function agrupar<T>(
  items: readonly T[],
  clave: (t: T) => string,
  valor: (t: T) => number,
): Array<[string, { total: number; cantidad: number }]> {
  const mapa = new Map<string, { total: number; cantidad: number }>();
  for (const it of items) {
    const k = clave(it);
    const acc = mapa.get(k) ?? { total: 0, cantidad: 0 };
    acc.total += valor(it);
    acc.cantidad += 1;
    mapa.set(k, acc);
  }
  return [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
}

export class ClienteReportesSimulado implements ClienteReportes {
  private ventas(rango: RangoFechas): VentaDemo[] {
    return ventasEntre(rango.desde, rango.hasta);
  }

  async resumen(rango: RangoFechas): Promise<ResumenVentas> {
    const ventas = this.ventas(rango);
    const total = ventas.reduce((a, v) => a + v.total, 0);
    const descuentos = ventas.reduce((a, v) => a + v.descuento, 0);
    return {
      cantidadVentas: ventas.length,
      totalVendido: dosDecimales(total),
      totalDescuentos: dosDecimales(descuentos),
      ticketPromedio: dosDecimales(ventas.length === 0 ? 0 : total / ventas.length),
    };
  }

  async serie(rango: RangoFechas): Promise<PuntoSerie[]> {
    // Solo los días CON ventas, igual que el endpoint real: es lo que hace
    // que el conteo por días trabajados de los reportes tenga sentido.
    const porDia = agrupar(this.ventas(rango), (v) => v.dia, (v) => v.total);
    return porDia
      .map(([fecha, { total, cantidad }]) => ({ fecha, total: dosDecimales(total), cantidad }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  async porMedioPago(rango: RangoFechas): Promise<VentaPorMedio[]> {
    return agrupar(this.ventas(rango), (v) => v.medioPago, (v) => v.total).map(
      ([medioPago, { total, cantidad }]) => ({ medioPago, total: dosDecimales(total), cantidad }),
    );
  }

  async porRubro(rango: RangoFechas): Promise<VentaPorRubro[]> {
    const lineas = this.ventas(rango).flatMap((v) => v.lineas);
    return agrupar(lineas, (l) => l.rubro, (l) => l.total).map(([rubro, { total }]) => ({
      rubro,
      total: dosDecimales(total),
    }));
  }

  async topProductos(rango: RangoFechas, limite = 10): Promise<TopProducto[]> {
    const lineas = this.ventas(rango).flatMap((v) => v.lineas);
    const porProducto = new Map<
      string,
      { nombre: string; codigo: string; cantidad: number; monto: number }
    >();
    for (const l of lineas) {
      const acc = porProducto.get(l.productoId) ?? {
        nombre: l.descripcion,
        codigo: l.codigo,
        cantidad: 0,
        monto: 0,
      };
      acc.cantidad += l.cantidad;
      acc.monto += l.total;
      porProducto.set(l.productoId, acc);
    }
    return [...porProducto.entries()]
      .sort((a, b) => b[1].monto - a[1].monto)
      .slice(0, limite)
      .map(([productoId, p]) => ({
        productoId,
        nombre: p.nombre,
        codigo: p.codigo,
        cantidad: String(p.cantidad),
        monto: dosDecimales(p.monto),
      }));
  }

  async rentabilidad(rango: RangoFechas): Promise<Rentabilidad> {
    const lineas = this.ventas(rango).flatMap((v) => v.lineas);
    const ventas = lineas.reduce((a, l) => a + l.total, 0);
    const costo = lineas.reduce((a, l) => a + l.costoUnitario * l.cantidad, 0);
    return {
      ventasTotal: dosDecimales(ventas),
      costoTotal: dosDecimales(costo),
      gananciaBruta: dosDecimales(ventas - costo),
    };
  }

  async detalleVentas(rango: RangoFechas): Promise<LineaDetalleVenta[]> {
    return this.ventas(rango).flatMap((v) =>
      v.lineas.map((l) => ({
        sucursal: "Demo",
        fecha: v.fecha,
        numeroTicket: v.numeroTicket,
        codigo: l.codigo,
        descripcion: l.descripcion,
        rubro: l.rubro,
        cantidad: String(l.cantidad),
        unitario: dosDecimales(l.unitario),
        total: dosDecimales(l.total),
        ganancia: dosDecimales(l.total - l.costoUnitario * l.cantidad),
      })),
    );
  }
}
