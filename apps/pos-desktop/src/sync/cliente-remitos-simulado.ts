/** Adaptador EN MEMORIA de remitos, para el desarrollo en el navegador. */
import {
  ErrorRemitos,
  type ClienteRemitos,
  type DatosRemito,
  type Remito,
} from "./cliente-remitos";

export class ClienteRemitosSimulado implements ClienteRemitos {
  private remitos: Remito[] = [
    {
      id: "rem-1",
      numero: 1,
      clienteNombre: "Restaurante El Fogón",
      observaciones: "Entrega en depósito",
      estado: "EMITIDO",
      creadoEn: new Date(Date.now() - 86400000).toISOString(),
      items: [
        { id: "i1", descripcion: "Yerba mate 1 kg", cantidad: "5", productoId: "yerba" },
        { id: "i2", descripcion: "Café molido 250 g", cantidad: "3", productoId: "cafe" },
      ],
    },
  ];
  private seq = 1;

  async listar(): Promise<Remito[]> {
    return this.remitos.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) }));
  }

  async crear(datos: DatosRemito): Promise<Remito> {
    const nuevo: Remito = {
      id: `rem-${++this.seq}`,
      numero: this.remitos.length + 1,
      clienteNombre: datos.clienteNombre ?? null,
      observaciones: datos.observaciones ?? null,
      estado: "EMITIDO",
      creadoEn: new Date().toISOString(),
      items: datos.items.map((it, idx) => ({
        id: `it-${this.seq}-${idx}`,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        productoId: it.productoId ?? null,
      })),
    };
    this.remitos = [nuevo, ...this.remitos];
    return { ...nuevo };
  }

  async anular(id: string): Promise<Remito> {
    const r = this.remitos.find((x) => x.id === id);
    if (!r) throw new ErrorRemitos(`Remito ${id} no encontrado`, 404);
    if (r.estado !== "EMITIDO") throw new ErrorRemitos("El remito ya está anulado", 400);
    const actualizado = { ...r, estado: "ANULADO" as const };
    this.remitos = this.remitos.map((x) => (x.id === id ? actualizado : x));
    return { ...actualizado };
  }
}
