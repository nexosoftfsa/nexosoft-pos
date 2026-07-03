/**
 * Adaptador EN MEMORIA de reportes, para el desarrollo en el navegador. Devuelve
 * datos de ejemplo para ver la pantalla sin backend (los números son fijos; el
 * rango no los cambia).
 */
import type { RangoFechas } from "../componentes/reportes-helpers";
import type {
  ClienteReportes,
  PuntoSerie,
  ResumenVentas,
  TopProducto,
  VentaPorMedio,
} from "./cliente-reportes";

export class ClienteReportesSimulado implements ClienteReportes {
  async resumen(_rango: RangoFechas): Promise<ResumenVentas> {
    void _rango;
    return {
      cantidadVentas: 42,
      totalVendido: "318500.00",
      totalDescuentos: "4200.00",
      ticketPromedio: "7583.33",
    };
  }

  async serie(_rango: RangoFechas): Promise<PuntoSerie[]> {
    void _rango;
    const base = new Date();
    const totales = [24000, 31000, 28500, 42000, 39000, 51000, 63000];
    return totales.map((t, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() - (totales.length - 1 - i));
      return { fecha: d.toISOString().slice(0, 10), total: t.toFixed(2), cantidad: Math.round(t / 7500) };
    });
  }

  async porMedioPago(_rango: RangoFechas): Promise<VentaPorMedio[]> {
    void _rango;
    return [
      { medioPago: "EFECTIVO", total: "148000.00", cantidad: 22 },
      { medioPago: "TARJETA_CREDITO", total: "92000.00", cantidad: 9 },
      { medioPago: "MERCADOPAGO_QR", total: "54500.00", cantidad: 8 },
      { medioPago: "CUENTA_CORRIENTE", total: "24000.00", cantidad: 3 },
    ];
  }

  async topProductos(_rango: RangoFechas, limite = 10): Promise<TopProducto[]> {
    void _rango;
    const datos: TopProducto[] = [
      { productoId: "yerba", nombre: "Yerba mate 1 kg", codigo: "7790007", cantidad: "58", monto: "220400.00" },
      { productoId: "gaseosa", nombre: "Gaseosa 1,5 L", codigo: "7790001", cantidad: "44", monto: "81400.00" },
      { productoId: "pan", nombre: "Pan lactal", codigo: "7790006", cantidad: "37", monto: "77700.00" },
      { productoId: "cafe", nombre: "Café molido 250 g", codigo: "7790004", cantidad: "19", monto: "81700.00" },
      { productoId: "leche", nombre: "Leche entera 1 L", codigo: "7790005", cantidad: "15", monto: "20250.00" },
    ];
    return datos.slice(0, limite);
  }
}
