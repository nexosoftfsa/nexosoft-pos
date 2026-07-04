/** Adaptador EN MEMORIA de presupuestos, para el desarrollo en el navegador. */
import {
  ErrorPresupuestos,
  type ClientePresupuestos,
  type DatosPresupuesto,
  type Presupuesto,
} from "./cliente-presupuestos";

export class ClientePresupuestosSimulado implements ClientePresupuestos {
  private presupuestos: Presupuesto[] = [
    {
      id: "pre-1",
      numero: 1,
      clienteNombre: "Restaurante El Fogón",
      observaciones: "Pedido semanal",
      validezDias: 15,
      total: "34500.00",
      estado: "VIGENTE",
      creadoEn: new Date(Date.now() - 86400000).toISOString(),
      items: [
        { id: "i1", descripcion: "Yerba mate 1 kg", cantidad: "5", precioUnitario: "3800.00", subtotal: "19000.00", productoId: "yerba" },
        { id: "i2", descripcion: "Café molido 250 g", cantidad: "3", precioUnitario: "4300.00", subtotal: "12900.00", productoId: "cafe" },
        { id: "i3", descripcion: "Pan lactal", cantidad: "1", precioUnitario: "2600.00", subtotal: "2600.00", productoId: "pan" },
      ],
    },
  ];
  private seq = 1;

  async listar(): Promise<Presupuesto[]> {
    return this.presupuestos.map((p) => ({ ...p, items: p.items.map((i) => ({ ...i })) }));
  }

  async crear(datos: DatosPresupuesto): Promise<Presupuesto> {
    let total = 0;
    const items = datos.items.map((it, idx) => {
      const subtotal = Number(it.cantidad) * Number(it.precioUnitario);
      total += subtotal;
      return {
        id: `it-${++this.seq}-${idx}`,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        subtotal: subtotal.toFixed(2),
        productoId: it.productoId ?? null,
      };
    });
    const nuevo: Presupuesto = {
      id: `pre-${++this.seq}`,
      numero: this.presupuestos.length + 1,
      clienteNombre: datos.clienteNombre ?? null,
      observaciones: datos.observaciones ?? null,
      validezDias: datos.validezDias ?? 15,
      total: total.toFixed(2),
      estado: "VIGENTE",
      creadoEn: new Date().toISOString(),
      items,
    };
    this.presupuestos = [nuevo, ...this.presupuestos];
    return { ...nuevo };
  }

  async convertir(id: string): Promise<Presupuesto> {
    return this.cambiar(id, "CONVERTIDO");
  }
  async anular(id: string): Promise<Presupuesto> {
    return this.cambiar(id, "ANULADO");
  }

  private cambiar(id: string, estado: "CONVERTIDO" | "ANULADO"): Presupuesto {
    const p = this.presupuestos.find((x) => x.id === id);
    if (!p) throw new ErrorPresupuestos(`Presupuesto ${id} no encontrado`, 404);
    if (p.estado !== "VIGENTE") throw new ErrorPresupuestos(`El presupuesto ya está ${p.estado.toLowerCase()}`, 400);
    const actualizado = { ...p, estado };
    this.presupuestos = this.presupuestos.map((x) => (x.id === id ? actualizado : x));
    return { ...actualizado };
  }
}
