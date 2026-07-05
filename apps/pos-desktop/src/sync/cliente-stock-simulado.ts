/**
 * Adaptador EN MEMORIA del módulo de stock, para el desarrollo en el navegador.
 * Reproduce el contrato del cloud-api: saldo = ENTRADA/AJUSTE menos SALIDA/VENTA;
 * las salidas validan stock (400). Para los **perecederos** (Fase 8.2) la ENTRADA
 * abre un lote con vencimiento y la SALIDA consume lotes por FEFO; expone lotes por
 * producto y alertas de vencimiento. Sembrado con el stock inicial de los productos
 * demo (algunos con lotes, uno ya vencido) para ver la pantalla en el preview.
 */
import { DEFS } from "../datos/bootstrap";
import {
  ErrorStock,
  type AlertaVencimiento,
  type ClienteStock,
  type DatosMovimiento,
  type LoteStock,
  type MovimientoStock,
  type ProductoStock,
  type SaldoStock,
} from "./cliente-stock";

/** Productos demo que se gestionan por lotes. */
const PERECEDEROS = new Set(["leche", "pan"]);
const DIA = 86_400_000;

interface MovInterno {
  id: string;
  tipo: MovimientoStock["tipo"];
  cantidad: string;
  motivo: string | null;
  creadoEn: string;
  producto: ProductoStock;
  loteId: string | null;
}

interface LoteInterno {
  id: string;
  productoId: string;
  numero: string | null;
  fechaVencimiento: string;
}

export class ClienteStockSimulado implements ClienteStock {
  private readonly productos: ProductoStock[];
  private movimientos: MovInterno[] = [];
  private lotesInternos: LoteInterno[] = [];
  private secuencia = 0;
  private loteSeq = 0;

  constructor() {
    this.productos = DEFS.map((d) => ({
      id: d.id,
      nombre: d.descripcion,
      codigo: d.codigo,
      requiereLote: PERECEDEROS.has(d.id),
    }));

    const base = Date.now() - 3600_000;
    DEFS.forEach((d, i) => {
      if (PERECEDEROS.has(d.id)) return; // los perecederos se siembran con lotes
      this.movimientos.push({
        id: `mov-ini-${d.id}`,
        tipo: "ENTRADA",
        cantidad: d.stock,
        motivo: "Stock inicial",
        creadoEn: new Date(base + i).toISOString(),
        producto: this.productoDe(d.id),
        loteId: null,
      });
    });

    // Perecederos con lotes: leche (uno vencido + uno lejano), pan (uno próximo).
    const ahora = Date.now();
    this.sembrarLote("leche", "L-2405", ahora - 3 * DIA, "8", base);
    this.sembrarLote("leche", "L-2407", ahora + 40 * DIA, "27", base);
    this.sembrarLote("pan", "P-118", ahora + 6 * DIA, "20", base);
  }

  private productoDe(productoId: string): ProductoStock {
    const p = this.productos.find((x) => x.id === productoId);
    if (!p) throw new ErrorStock(`Producto ${productoId} no encontrado`, 404);
    return p;
  }

  private sembrarLote(
    productoId: string,
    numero: string,
    vencimientoMs: number,
    cantidad: string,
    baseMs: number,
  ) {
    const lote: LoteInterno = {
      id: `lote-${++this.loteSeq}`,
      productoId,
      numero,
      fechaVencimiento: new Date(vencimientoMs).toISOString(),
    };
    this.lotesInternos.push(lote);
    this.movimientos.push({
      id: `mov-lote-${lote.id}`,
      tipo: "ENTRADA",
      cantidad,
      motivo: "Stock inicial",
      creadoEn: new Date(baseMs).toISOString(),
      producto: this.productoDe(productoId),
      loteId: lote.id,
    });
  }

  private saldoDe(productoId: string): number {
    return this.movimientos
      .filter((m) => m.producto.id === productoId)
      .reduce((acc, m) => sumaDelta(acc, m.tipo, m.cantidad), 0);
  }

  private saldoDeLote(loteId: string): number {
    return this.movimientos
      .filter((m) => m.loteId === loteId)
      .reduce((acc, m) => sumaDelta(acc, m.tipo, m.cantidad), 0);
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
      .map(({ loteId: _loteId, ...m }) => ({ ...m }));
  }

  async lotes(productoId: string): Promise<LoteStock[]> {
    return this.lotesInternos
      .filter((l) => l.productoId === productoId)
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
      .map((l) => ({
        id: l.id,
        numero: l.numero,
        fechaVencimiento: l.fechaVencimiento,
        saldo: String(this.saldoDeLote(l.id)),
      }));
  }

  async vencimientos(dias = 30): Promise<AlertaVencimiento[]> {
    const ahora = Date.now();
    const limite = dias * DIA;
    const alertas: AlertaVencimiento[] = [];
    for (const l of this.lotesInternos) {
      const saldo = this.saldoDeLote(l.id);
      if (saldo <= 0) continue;
      const delta = new Date(l.fechaVencimiento).getTime() - ahora;
      if (delta > limite) continue;
      alertas.push({
        producto: this.productoDe(l.productoId),
        loteId: l.id,
        numero: l.numero,
        fechaVencimiento: l.fechaVencimiento,
        saldo: String(saldo),
        diasParaVencer: Math.floor(delta / DIA),
        vencido: delta < 0,
      });
    }
    return alertas.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  }

  async registrarMovimiento(datos: DatosMovimiento): Promise<MovimientoStock> {
    const producto = this.productoDe(datos.productoId);
    const cantidad = Number(datos.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ErrorStock("La cantidad debe ser mayor a cero", 400);
    }

    if (producto.requiereLote && datos.tipo === "ENTRADA") {
      return this.entradaConLote(producto, datos);
    }
    if (producto.requiereLote && datos.tipo === "SALIDA") {
      return this.salidaFefo(producto, datos, cantidad);
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
    return this.push(producto, datos.tipo, datos.cantidad, datos.motivo ?? null, null);
  }

  private entradaConLote(producto: ProductoStock, datos: DatosMovimiento): MovimientoStock {
    if (!datos.fechaVencimiento) {
      throw new ErrorStock(
        "La ENTRADA de un producto con lote necesita una fecha de vencimiento.",
        400,
      );
    }
    const lote: LoteInterno = {
      id: `lote-${++this.loteSeq}`,
      productoId: producto.id,
      numero: datos.numeroLote ?? null,
      fechaVencimiento: new Date(datos.fechaVencimiento).toISOString(),
    };
    this.lotesInternos = [...this.lotesInternos, lote];
    return this.push(producto, "ENTRADA", datos.cantidad, datos.motivo ?? null, lote.id);
  }

  private salidaFefo(
    producto: ProductoStock,
    datos: DatosMovimiento,
    cantidad: number,
  ): MovimientoStock {
    const conSaldo = this.lotesInternos
      .filter((l) => l.productoId === producto.id && this.saldoDeLote(l.id) > 0)
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
    let restante = cantidad;
    const tramos: Array<{ loteId: string; cantidad: number }> = [];
    for (const l of conSaldo) {
      if (restante <= 0) break;
      const tomar = Math.min(this.saldoDeLote(l.id), restante);
      tramos.push({ loteId: l.id, cantidad: tomar });
      restante -= tomar;
    }
    if (restante > 0) {
      const disponible = cantidad - restante;
      throw new ErrorStock(
        `Stock insuficiente en lotes. Disponible: ${disponible}, solicitado: ${cantidad}`,
        400,
      );
    }
    let ultimo: MovimientoStock | null = null;
    for (const t of tramos) {
      ultimo = this.push(producto, "SALIDA", String(t.cantidad), datos.motivo ?? null, t.loteId);
    }
    return ultimo!;
  }

  private push(
    producto: ProductoStock,
    tipo: MovimientoStock["tipo"],
    cantidad: string,
    motivo: string | null,
    loteId: string | null,
  ): MovimientoStock {
    const mov: MovInterno = {
      id: `mov-${++this.secuencia}`,
      tipo,
      cantidad,
      motivo,
      creadoEn: new Date().toISOString(),
      producto,
      loteId,
    };
    this.movimientos = [...this.movimientos, mov];
    const { loteId: _loteId, ...publico } = mov;
    return { ...publico };
  }
}

function sumaDelta(acc: number, tipo: MovimientoStock["tipo"], cantidad: string): number {
  const c = Number(cantidad);
  return tipo === "ENTRADA" || tipo === "AJUSTE" ? acc + c : acc - c;
}
