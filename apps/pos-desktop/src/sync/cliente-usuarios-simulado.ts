/**
 * Adaptador EN MEMORIA de gestión de usuarios, para el modo demo.
 *
 * Sin esto, Usuarios era uno de los dos módulos que en el demo caían en la
 * pantalla de "próximamente" — dando la impresión de que el sistema estaba a
 * medio hacer cuando en realidad solo faltaba con qué hablar.
 *
 * Los cambios viven mientras dure la sesión del navegador: alcanza para
 * mostrar el alta, el cambio de rol, el activar/desactivar y el cambio de
 * contraseña.
 */
import {
  ErrorUsuarios,
  type CambioPassword,
  type CambiosUsuario,
  type ClienteUsuarios,
  type EstadoFoto,
  type NuevoUsuario,
  type UsuarioRemoto,
} from "./cliente-usuarios-http";

function haceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

export class ClienteUsuariosSimulado implements ClienteUsuarios {
  private usuarios: UsuarioRemoto[] = [
    {
      id: "u-demo-1",
      email: "demo@nexosoft.local",
      nombreDisplay: "Dueño (demo)",
      rol: "ADMIN",
      activo: true,
      creadoEn: haceDias(180),
    },
    {
      id: "u-demo-2",
      email: "encargado",
      nombreDisplay: "Encargada de turno",
      rol: "SUPERVISOR",
      activo: true,
      creadoEn: haceDias(96),
    },
    {
      id: "u-demo-3",
      email: "caja1",
      nombreDisplay: "Cajero mañana",
      rol: "CAJERO",
      activo: true,
      creadoEn: haceDias(40),
    },
    {
      id: "u-demo-4",
      email: "caja2",
      nombreDisplay: "Cajero tarde",
      rol: "CAJERO",
      activo: false,
      creadoEn: haceDias(12),
    },
  ];
  private fotos = new Map<string, string>();
  private secuencia = 4;

  async listar(): Promise<UsuarioRemoto[]> {
    return this.usuarios.map((u) => ({ ...u }));
  }

  async crear(datos: NuevoUsuario): Promise<UsuarioRemoto> {
    if (this.usuarios.some((u) => u.email === datos.email)) {
      throw new ErrorUsuarios("El email ya está registrado", 409);
    }
    const nuevo: UsuarioRemoto = {
      id: `u-demo-${++this.secuencia}`,
      email: datos.email,
      nombreDisplay: datos.nombreDisplay,
      rol: datos.rol,
      activo: true,
      creadoEn: new Date().toISOString(),
    };
    this.usuarios = [...this.usuarios, nuevo];
    return { ...nuevo };
  }

  async actualizar(id: string, cambios: CambiosUsuario): Promise<UsuarioRemoto> {
    const actualizado = this.cambiar(id, cambios);
    return { ...actualizado };
  }

  async cambiarPassword(id: string, cambio: CambioPassword): Promise<UsuarioRemoto> {
    const u = this.buscar(id);
    // El demo no guarda contraseñas; lo que sí se reproduce es la regla que
    // más confunde: para cambiar la propia hay que saber la actual.
    if (id === "u-demo-1" && (cambio.passwordActual ?? "") === "") {
      throw new ErrorUsuarios("Para cambiar tu propia contraseña tenés que escribir la actual.", 400);
    }
    return { ...u };
  }

  async obtenerFoto(id: string): Promise<EstadoFoto> {
    return { fotoBase64: this.fotos.get(id) ?? null };
  }

  async actualizarFoto(id: string, fotoBase64: string): Promise<EstadoFoto> {
    if (fotoBase64.trim() === "") this.fotos.delete(id);
    else this.fotos.set(id, fotoBase64);
    return { fotoBase64: this.fotos.get(id) ?? null };
  }

  private buscar(id: string): UsuarioRemoto {
    const u = this.usuarios.find((x) => x.id === id);
    if (!u) throw new ErrorUsuarios("Usuario no encontrado", 404);
    return u;
  }

  private cambiar(id: string, cambios: CambiosUsuario): UsuarioRemoto {
    const u = this.buscar(id);
    const actualizado: UsuarioRemoto = {
      ...u,
      ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
    };
    this.usuarios = this.usuarios.map((x) => (x.id === id ? actualizado : x));
    return actualizado;
  }
}
