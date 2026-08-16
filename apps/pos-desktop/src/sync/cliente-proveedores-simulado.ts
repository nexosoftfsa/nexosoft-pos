/**
 * Adaptador EN MEMORIA de proveedores, para el desarrollo en el navegador.
 * ABM simple, sembrado con algunos proveedores de ejemplo.
 */
import {
  ErrorProveedores,
  type ClienteProveedores,
  type DatosProveedor,
  type Proveedor,
} from "./cliente-proveedores";

export class ClienteProveedoresSimulado implements ClienteProveedores {
  private proveedores: Proveedor[] = [
    {
      id: "prov-sur",
      nombre: "Distribuidora Sur",
      cuit: "30-71234567-8",
      contacto: "Marcelo Díaz",
      email: "ventas@distribuidorasur.com.ar",
      telefono: "3541-555200",
      direccion: "Ruta 5 km 12",
      activo: true,
    },
    {
      id: "prov-lacteos",
      nombre: "Lácteos del Valle",
      cuit: "30-70999888-1",
      contacto: null,
      email: null,
      telefono: "3541-555321",
      direccion: null,
      activo: true,
    },
  ];
  private secuencia = 0;

  private buscar(id: string): Proveedor {
    const p = this.proveedores.find((x) => x.id === id);
    if (!p) throw new ErrorProveedores(`Proveedor ${id} no encontrado`, 404);
    return p;
  }

  async listar(incluirInactivos: boolean): Promise<Proveedor[]> {
    return this.proveedores.filter((p) => incluirInactivos || p.activo);
  }

  async crear(datos: DatosProveedor): Promise<Proveedor> {
    const nuevo: Proveedor = {
      id: `prov-${++this.secuencia}`,
      nombre: datos.nombre,
      cuit: datos.cuit ?? null,
      contacto: datos.contacto ?? null,
      email: datos.email ?? null,
      telefono: datos.telefono ?? null,
      direccion: datos.direccion ?? null,
      activo: true,
    };
    this.proveedores = [...this.proveedores, nuevo];
    return { ...nuevo };
  }

  async actualizar(
    id: string,
    cambios: Partial<DatosProveedor> & { activo?: boolean },
  ): Promise<Proveedor> {
    const actual = this.buscar(id);
    const actualizado: Proveedor = {
      ...actual,
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
      ...(cambios.cuit !== undefined ? { cuit: cambios.cuit || null } : {}),
      ...(cambios.contacto !== undefined ? { contacto: cambios.contacto || null } : {}),
      ...(cambios.email !== undefined ? { email: cambios.email || null } : {}),
      ...(cambios.telefono !== undefined ? { telefono: cambios.telefono || null } : {}),
      ...(cambios.direccion !== undefined ? { direccion: cambios.direccion || null } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
    };
    this.proveedores = this.proveedores.map((p) => (p.id === id ? actualizado : p));
    return { ...actualizado };
  }

  async desactivar(id: string): Promise<void> {
    this.buscar(id);
    this.proveedores = this.proveedores.map((p) => (p.id === id ? { ...p, activo: false } : p));
  }
}
