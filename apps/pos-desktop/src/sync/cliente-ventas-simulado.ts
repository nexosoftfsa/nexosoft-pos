/**
 * Adaptador EN MEMORIA de comprobantes, para el desarrollo en el navegador.
 * Sembrado con algunas ventas; anular emite una Nota de Crédito (comprobante
 * asociado), marca el original ANULADA. Sin backend fiscal real (CAE simulado).
 */
import { ventasDemo, type VentaDemo } from "../datos/ventas-demo";
import {
  ErrorVentas,
  type Comprobante,
  type ClienteVentas,
  type ResultadoAnulacion,
  type VerificacionArca,
} from "./cliente-ventas";

function notaCreditoDe(tipo: string | null): string {
  return tipo?.startsWith("Factura") ? tipo.replace("Factura", "NotaCredito") : "NotaCreditoB";
}

function caeSimulado(): string {
  return String(Date.now()).padStart(14, "0").slice(-14);
}

export class ClienteVentasSimulado implements ClienteVentas {
  private comprobantes: Comprobante[];
  private secuencia = 100;

  constructor() {
    const base = Date.now();
    // Historial real del demo: los mismos 30 días de ventas de los que salen
    // los reportes (ventas-demo.ts). Antes acá había dos comprobantes escritos
    // a mano que no coincidían con nada de lo que mostraba Reportes.
    this.comprobantes = ventasDemo()
      .slice(-120)
      .reverse()
      .map((v, i) => this.deVentaDemo(v, i, base));
    this.comprobantes.push(
      {
        id: "cmp-1",
        estado: "COMPLETADA",
        subtotal: "6800.00",
        descuento: "0.00",
        total: "6800.00",
        medioPago: "EFECTIVO",
        cae: caeSimulado(),
        caeFechaVto: new Date(base + 10 * 86400000).toISOString(),
        numeroComprobante: 1,
        tipoComprobante: "FacturaB",
        creadaEn: new Date(base - 2 * 3600000).toISOString(),
        comprobanteAsociadoId: null,
        items: [
          { id: "it1", cantidad: "2", precioUnitario: "3400.00", subtotal: "6800.00", producto: { id: "yerba", nombre: "Yerba mate 1 kg", codigo: "7790007" } },
        ],
      },
      {
        id: "cmp-2",
        estado: "COMPLETADA",
        subtotal: "12000.00",
        descuento: "0.00",
        total: "12000.00",
        medioPago: "COMBINADO",
        cae: caeSimulado(),
        caeFechaVto: new Date(base + 10 * 86400000).toISOString(),
        numeroComprobante: 2,
        tipoComprobante: "FacturaA",
        creadaEn: new Date(base - 3600000).toISOString(),
        comprobanteAsociadoId: null,
        items: [
          { id: "it2", cantidad: "1", precioUnitario: "12000.00", subtotal: "12000.00", producto: { id: "cafe", nombre: "Café molido 250 g", codigo: "7790004" } },
        ],
        pagos: [
          { id: "pg1", medioPago: "EFECTIVO", monto: "5000.00" },
          { id: "pg2", medioPago: "TARJETA_CREDITO", monto: "7000.00" },
        ],
      },
    );
  }

  /** Una venta del historial demo como comprobante fiscal simulado. */
  private deVentaDemo(v: VentaDemo, indice: number, base: number): Comprobante {
    const bruto = v.total + v.descuento;
    return {
      id: v.id,
      estado: "COMPLETADA",
      subtotal: bruto.toFixed(2),
      descuento: v.descuento.toFixed(2),
      total: v.total.toFixed(2),
      medioPago: v.medioPago,
      cae: String(base + indice).padStart(14, "0").slice(-14),
      caeFechaVto: new Date(base + 10 * 86400000).toISOString(),
      numeroComprobante: v.numeroTicket,
      tipoComprobante: "FacturaB",
      creadaEn: v.fecha,
      comprobanteAsociadoId: null,
      items: v.lineas.map((l, j) => ({
        id: `${v.id}-it${j}`,
        cantidad: String(l.cantidad),
        precioUnitario: l.unitario.toFixed(2),
        subtotal: l.total.toFixed(2),
        producto: { id: l.productoId, nombre: l.descripcion, codigo: l.codigo },
      })),
    };
  }

  async historial(): Promise<Comprobante[]> {
    return [...this.comprobantes]
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
      .map((c) => ({ ...c }));
  }

  /**
   * En el navegador no hay ARCA ni certificado: se contesta lo mismo que
   * contestaría el servidor sin alta fiscal, en vez de inventar un "autorizado"
   * que daría una confianza falsa.
   */
  async verificarEnArca(id: string): Promise<VerificacionArca> {
    const c = this.comprobantes.find((x) => x.id === id);
    if (!c) throw new ErrorVentas(`Comprobante ${id} no encontrado`, 404);
    return {
      estado: "NO_SE_PUDO",
      mensaje: "No se pudo consultar a ARCA: esta es la versión de desarrollo, sin certificado.",
      diferencias: [],
    };
  }

  async anular(id: string): Promise<ResultadoAnulacion> {
    const original = this.comprobantes.find((c) => c.id === id);
    if (!original) throw new ErrorVentas(`Comprobante ${id} no encontrado`, 404);
    if (original.estado === "ANULADA") throw new ErrorVentas("El comprobante ya está anulado", 400);
    if (original.tipoComprobante?.startsWith("NotaCredito")) {
      throw new ErrorVentas("No se puede anular una Nota de Crédito", 400);
    }

    const nc: Comprobante = {
      ...original,
      id: `nc-${++this.secuencia}`,
      tipoComprobante: notaCreditoDe(original.tipoComprobante),
      numeroComprobante: ++this.secuencia,
      cae: caeSimulado(),
      creadaEn: new Date().toISOString(),
      comprobanteAsociadoId: original.id,
    };
    const anulada: Comprobante = { ...original, estado: "ANULADA" };
    this.comprobantes = [nc, ...this.comprobantes.map((c) => (c.id === id ? anulada : c))];
    return { anulada, notaCredito: nc };
  }
}
