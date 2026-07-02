/**
 * Adaptador EN MEMORIA de cuentas corrientes, para el desarrollo en el navegador.
 * Reproduce el contrato del cloud-api: saldo = ΣCARGO − ΣPAGO, respeta el límite
 * de crédito en los cargos (409). Sembrado con algunos clientes y movimientos.
 */
import {
  ErrorCtaCte,
  type Cliente,
  type ClienteConSaldo,
  type ClienteCtaCte,
  type DatosCliente,
  type EstadoCuenta,
  type MovimientoCtaCte,
} from "./cliente-ctacte";

function fmt(n: number): string {
  return n.toFixed(2);
}

export class ClienteCtaCteSimulado implements ClienteCtaCte {
  private clientes: Cliente[] = [
    {
      id: "cli-ana",
      nombre: "Kiosco Ana",
      documento: "27-30111222-3",
      condicionIva: "MONOTRIBUTO",
      email: null,
      telefono: "3541-555100",
      direccion: "San Martín 145",
      limiteCredito: "50000.00",
      activo: true,
    },
    {
      id: "cli-jose",
      nombre: "José Pérez",
      documento: "20-25333444-9",
      condicionIva: "CONSUMIDOR_FINAL",
      email: "jose@example.com",
      telefono: null,
      direccion: null,
      limiteCredito: "0.00",
      activo: true,
    },
    {
      id: "cli-rest",
      nombre: "Restaurante El Fogón",
      documento: "30-71555666-7",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      email: null,
      telefono: null,
      direccion: "Belgrano 890",
      limiteCredito: "0.00",
      activo: true,
    },
  ];
  private movimientos: Array<MovimientoCtaCte & { clienteId: string }> = [
    { id: "m1", clienteId: "cli-ana", tipo: "CARGO", monto: "12000.00", concepto: "Venta a cuenta", creadoEn: new Date(Date.now() - 4 * 86400000).toISOString() },
    { id: "m2", clienteId: "cli-ana", tipo: "PAGO", monto: "5000.00", concepto: "Cobro parcial", creadoEn: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "m3", clienteId: "cli-rest", tipo: "CARGO", monto: "34500.00", concepto: "Pedido semanal", creadoEn: new Date(Date.now() - 86400000).toISOString() },
  ];
  private secuencia = 0;

  private saldoDe(clienteId: string): number {
    return this.movimientos
      .filter((m) => m.clienteId === clienteId)
      .reduce((acc, m) => (m.tipo === "CARGO" ? acc + Number(m.monto) : acc - Number(m.monto)), 0);
  }

  private conSaldo(c: Cliente): ClienteConSaldo {
    return { ...c, saldo: fmt(this.saldoDe(c.id)) };
  }

  private buscar(id: string): Cliente {
    const c = this.clientes.find((x) => x.id === id);
    if (!c) throw new ErrorCtaCte(`Cliente ${id} no encontrado`, 404);
    return c;
  }

  async listar(incluirInactivos: boolean): Promise<ClienteConSaldo[]> {
    return this.clientes
      .filter((c) => incluirInactivos || c.activo)
      .map((c) => this.conSaldo(c));
  }

  async crear(datos: DatosCliente): Promise<Cliente> {
    const nuevo: Cliente = {
      id: `cli-${++this.secuencia}`,
      nombre: datos.nombre,
      documento: datos.documento ?? null,
      condicionIva: datos.condicionIva ?? "CONSUMIDOR_FINAL",
      email: datos.email ?? null,
      telefono: datos.telefono ?? null,
      direccion: datos.direccion ?? null,
      limiteCredito: datos.limiteCredito ?? "0.00",
      activo: true,
    };
    this.clientes = [...this.clientes, nuevo];
    return { ...nuevo };
  }

  async actualizar(id: string, cambios: Partial<DatosCliente> & { activo?: boolean }): Promise<Cliente> {
    const actual = this.buscar(id);
    const actualizado: Cliente = {
      ...actual,
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
      ...(cambios.documento !== undefined ? { documento: cambios.documento || null } : {}),
      ...(cambios.condicionIva !== undefined ? { condicionIva: cambios.condicionIva } : {}),
      ...(cambios.email !== undefined ? { email: cambios.email || null } : {}),
      ...(cambios.telefono !== undefined ? { telefono: cambios.telefono || null } : {}),
      ...(cambios.direccion !== undefined ? { direccion: cambios.direccion || null } : {}),
      ...(cambios.limiteCredito !== undefined ? { limiteCredito: cambios.limiteCredito } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
    };
    this.clientes = this.clientes.map((c) => (c.id === id ? actualizado : c));
    return { ...actualizado };
  }

  async desactivar(id: string): Promise<void> {
    this.buscar(id);
    this.clientes = this.clientes.map((c) => (c.id === id ? { ...c, activo: false } : c));
  }

  async estadoCuenta(id: string): Promise<EstadoCuenta> {
    const cliente = this.conSaldo(this.buscar(id));
    const movimientos = this.movimientos
      .filter((m) => m.clienteId === id)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      .map(({ clienteId: _clienteId, ...m }) => {
        void _clienteId;
        return m;
      });
    return { cliente, movimientos };
  }

  async registrarCargo(id: string, monto: string, concepto?: string): Promise<ClienteConSaldo> {
    const cliente = this.buscar(id);
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) throw new ErrorCtaCte("El monto debe ser mayor a cero", 400);
    const limite = Number(cliente.limiteCredito);
    if (limite > 0 && this.saldoDe(id) + m > limite) {
      throw new ErrorCtaCte(
        `El cargo supera el límite de crédito (límite ${fmt(limite)}, saldo ${fmt(this.saldoDe(id))})`,
        409,
      );
    }
    this.agregar(id, "CARGO", monto, concepto);
    return this.conSaldo(cliente);
  }

  async registrarPago(id: string, monto: string, concepto?: string): Promise<ClienteConSaldo> {
    const cliente = this.buscar(id);
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) throw new ErrorCtaCte("El monto debe ser mayor a cero", 400);
    this.agregar(id, "PAGO", monto, concepto);
    return this.conSaldo(cliente);
  }

  private agregar(clienteId: string, tipo: "CARGO" | "PAGO", monto: string, concepto?: string) {
    this.movimientos = [
      {
        id: `mov-${++this.secuencia}`,
        clienteId,
        tipo,
        monto,
        concepto: concepto ?? null,
        creadoEn: new Date().toISOString(),
      },
      ...this.movimientos,
    ];
  }
}
