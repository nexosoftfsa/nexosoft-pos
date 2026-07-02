/**
 * Adaptador EN MEMORIA del módulo de stock, para el desarrollo en el navegador.
 * Reproduce el contrato del cloud-api: saldo = suma de ENTRADA/AJUSTE menos
 * SALIDA/VENTA; las salidas validan stock suficiente (400). Sembrado con el stock
 * inicial de los productos demo (un movimiento ENTRADA "Stock inicial" por cada
 * uno) para poder ver la pantalla y su historial en el preview.
 */
import { DEFS } from "../datos/bootstrap";
import {
  ErrorStock,
  type ClienteStock,
  type DatosMovimiento,
  type MovimientoStock,
  type ProductoStock,
  type SaldoStock,
} from "./cliente-stock";

interface MovInterno {
  id: string;
  tipo: MovimientoStock["tipo"];
  cantidad: string;
  motivo: string | null;
  creadoEn: string;
  producto: ProductoStock;
}

export class ClienteStockSimulado implements ClienteStock {
  private readonly productos: ProductoStock[];
  private movimientos: MovInterno[] = [];
  private secuencia = 0;

  constructor() {
    this.productos = DEFS.map((d) => ({ id: d.id, nombre: d.descripcion, codigo: d.codigo }));
    // Stock inicial: una ENTRADA por producto (una hora atrás, para ordenar bien).
    const base = Date.now() - 3600_000;
    this.movimientos = DEFS.map((d, i) => ({
      id: `mov-ini-${d.id}`,
      tipo: "ENTRADA" as const,
      cantidad: d.stock,
      motivo: "Stock inicial",
      creadoEn: new Date(base + i).toISOString(),
      producto: { id: d.id, nombre: d.descripcion, codigo: d.codigo },
    }));
  }

  private saldoDe(productoId: string): number {
    return this.movimientos
      .filter((m) => m.producto.id === productoId)
      .reduce((acc, m) => {
        const c = Number(m.cantidad);
        return m.tipo === "ENTRADA" || m.tipo === "AJUSTE" ? acc + c : acc - c;
      }, 0);
  }

  async saldos(): Promise<SaldoStock[]> {
    return this.productos.map((producto) => ({
      producto,
      saldo: String(this.saldoDe(producto.id)),
    }));
  }

  async historial(productoId: string): Promise<MovimientoStock[]> {
    return this.movimientos
      .filter((m) => m.producto.id === productoId)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      .map((m) => ({ ...m }));
  }

  async registrarMovimiento(datos: DatosMovimiento): Promise<MovimientoStock> {
    const producto = this.productos.find((p) => p.id === datos.productoId);
    if (!producto) throw new ErrorStock(`Producto ${datos.productoId} no encontrado`, 404);

    const cantidad = Number(datos.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ErrorStock("La cantidad debe ser mayor a cero", 400);
    }
    if (datos.tipo === "SALIDA" || datos.tipo === "VENTA") {
      const disponible = this.saldoDe(datos.productoId);
      if (disponible < cantidad) {
        throw new ErrorStock(
          `Stock insuficiente. Disponible: ${disponible}, solicitado: ${cantidad}`,
          400,
        );
      }
    }

    const mov: MovInterno = {
      id: `mov-${++this.secuencia}`,
      tipo: datos.tipo,
      cantidad: datos.cantidad,
      motivo: datos.motivo ?? null,
      creadoEn: new Date().toISOString(),
      producto,
    };
    this.movimientos = [...this.movimientos, mov];
    return { ...mov };
  }
}
