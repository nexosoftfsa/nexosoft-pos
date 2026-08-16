/** Lógica pura de Proveedores (Fase 12): formulario, validación y filtro. */
import type { DatosProveedor, Proveedor } from "../sync/cliente-proveedores";

export interface FormProveedor {
  nombre: string;
  cuit: string;
  contacto: string;
  email: string;
  telefono: string;
  direccion: string;
}

export const FORM_PROVEEDOR_VACIO: FormProveedor = {
  nombre: "",
  cuit: "",
  contacto: "",
  email: "",
  telefono: "",
  direccion: "",
};

export function formDesdeProveedor(p: Proveedor): FormProveedor {
  return {
    nombre: p.nombre,
    cuit: p.cuit ?? "",
    contacto: p.contacto ?? "",
    email: p.email ?? "",
    telefono: p.telefono ?? "",
    direccion: p.direccion ?? "",
  };
}

export function validarProveedor(f: FormProveedor): string[] {
  const errores: string[] = [];
  if (f.nombre.trim() === "") errores.push("El nombre es obligatorio.");
  if (f.email.trim() !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) {
    errores.push("El email no tiene un formato válido.");
  }
  return errores;
}

export function aDatosProveedor(f: FormProveedor): DatosProveedor {
  const opt = (v: string) => (v.trim() === "" ? undefined : v.trim());
  return {
    nombre: f.nombre.trim(),
    ...(opt(f.cuit) !== undefined ? { cuit: opt(f.cuit)! } : {}),
    ...(opt(f.contacto) !== undefined ? { contacto: opt(f.contacto)! } : {}),
    ...(opt(f.email) !== undefined ? { email: opt(f.email)! } : {}),
    ...(opt(f.telefono) !== undefined ? { telefono: opt(f.telefono)! } : {}),
    ...(opt(f.direccion) !== undefined ? { direccion: opt(f.direccion)! } : {}),
  };
}

/** Filtra por texto (nombre, CUIT o contacto). */
export function filtrarProveedores(proveedores: readonly Proveedor[], busqueda: string): Proveedor[] {
  const q = busqueda.trim().toLowerCase();
  if (q === "") return [...proveedores];
  return proveedores.filter((p) =>
    [p.nombre, p.cuit ?? "", p.contacto ?? ""].some((c) => c.toLowerCase().includes(q)),
  );
}
