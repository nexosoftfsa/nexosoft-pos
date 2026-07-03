/**
 * Adaptador EN MEMORIA de comprobantes, para el desarrollo en el navegador.
 * Sembrado con algunas ventas; anular emite una Nota de Crédito (comprobante
 * asociado), marca el original ANULADA. Sin backend fiscal real (CAE simulado).
 */
import {
  ErrorVentas,
  type Comprobante,
  type ClienteVentas,
  type ResultadoAnulacion,
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
    this.comprobantes = [
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
    ];
  }

  async historial(): Promise<Comprobante[]> {
    return [...this.comprobantes]
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
      .map((c) => ({ ...c }));
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
