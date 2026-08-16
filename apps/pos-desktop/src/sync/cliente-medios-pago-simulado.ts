/**
 * Adaptador EN MEMORIA de medios de pago, para el desarrollo en el navegador.
 * ABM simple, sembrado con un par de tarjetas de ejemplo.
 */
import {
  ErrorMediosPago,
  type ClienteMediosPago,
  type DatosTarjeta,
  type Tarjeta,
} from "./cliente-medios-pago";

export class ClienteMediosPagoSimulado implements ClienteMediosPago {
  private tarjetas: Tarjeta[] = [
    {
      id: "tar-galicia",
      banco: "Banco Galicia",
      tipo: "CREDITO",
      marca: "Visa",
      activo: true,
      tasas: [
        { cantidadCuotas: 1, recargoPorcentaje: 0 },
        { cantidadCuotas: 3, recargoPorcentaje: 10 },
        { cantidadCuotas: 6, recargoPorcentaje: 18 },
      ],
    },
    {
      id: "tar-santander-debito",
      banco: "Banco Santander",
      tipo: "DEBITO",
      marca: null,
      activo: true,
      tasas: [{ cantidadCuotas: 1, recargoPorcentaje: 0 }],
    },
  ];
  private secuencia = 0;

  private buscar(id: string): Tarjeta {
    const t = this.tarjetas.find((x) => x.id === id);
    if (!t) throw new ErrorMediosPago(`Tarjeta ${id} no encontrada`, 404);
    return t;
  }

  async listar(incluirInactivas: boolean): Promise<Tarjeta[]> {
    return this.tarjetas.filter((t) => incluirInactivas || t.activo);
  }

  async crear(datos: DatosTarjeta): Promise<Tarjeta> {
    const nueva: Tarjeta = {
      id: `tar-${++this.secuencia}`,
      banco: datos.banco,
      tipo: datos.tipo,
      marca: datos.marca ?? null,
      activo: true,
      tasas: datos.tasas ?? [],
    };
    this.tarjetas = [...this.tarjetas, nueva];
    return { ...nueva };
  }

  async actualizar(
    id: string,
    cambios: Partial<DatosTarjeta> & { activo?: boolean },
  ): Promise<Tarjeta> {
    const actual = this.buscar(id);
    const actualizada: Tarjeta = {
      ...actual,
      ...(cambios.banco !== undefined ? { banco: cambios.banco } : {}),
      ...(cambios.tipo !== undefined ? { tipo: cambios.tipo } : {}),
      ...(cambios.marca !== undefined ? { marca: cambios.marca || null } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
      ...(cambios.tasas !== undefined ? { tasas: cambios.tasas } : {}),
    };
    this.tarjetas = this.tarjetas.map((t) => (t.id === id ? actualizada : t));
    return { ...actualizada };
  }

  async desactivar(id: string): Promise<void> {
    this.buscar(id);
    this.tarjetas = this.tarjetas.map((t) => (t.id === id ? { ...t, activo: false } : t));
  }
}
