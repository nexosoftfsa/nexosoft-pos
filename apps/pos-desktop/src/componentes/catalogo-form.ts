/**
 * Lógica pura del formulario de producto (Fase 7.2): tipos de IVA, validación y
 * normalización de los datos antes de mandarlos al servidor. Separada de la UI
 * para poder testearla sin React.
 */
import type {
  DatosProducto,
  ProductoAdmin,
  TipoIvaRemoto,
  TipoProductoRemoto,
} from "../sync/cliente-catalogo-admin";

export const TIPOS_IVA: ReadonlyArray<{ valor: TipoIvaRemoto; etiqueta: string }> = [
  { valor: "IVA_21", etiqueta: "21%" },
  { valor: "IVA_10_5", etiqueta: "10,5%" },
  { valor: "IVA_27", etiqueta: "27%" },
  { valor: "EXENTO", etiqueta: "Exento" },
];

export function etiquetaIva(tipo: TipoIvaRemoto): string {
  return TIPOS_IVA.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

/** Una fila del armador de combo (producto elegido + cantidad, ambos como texto). */
export interface ComponenteForm {
  componenteId: string;
  cantidad: string;
}

export interface FormProducto {
  codigo: string;
  nombre: string;
  descripcion: string;
  precioVenta: string;
  precioCosto: string;
  tipoIva: TipoIvaRemoto;
  tipo: TipoProductoRemoto;
  componentes: ComponenteForm[];
  categoriaId: string;
}

export const FORM_VACIO: FormProducto = {
  codigo: "",
  nombre: "",
  descripcion: "",
  precioVenta: "",
  precioCosto: "",
  tipoIva: "IVA_21",
  tipo: "SIMPLE",
  componentes: [],
  categoriaId: "",
};

/** Arma el formulario a partir de un producto existente (para editar). */
export function formDesdeProducto(p: ProductoAdmin): FormProducto {
  return {
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    precioVenta: p.precioVenta,
    precioCosto: p.precioCosto,
    tipoIva: p.tipoIva,
    tipo: p.tipo,
    componentes: (p.componentes ?? []).map((c) => ({
      componenteId: c.componenteId,
      cantidad: c.cantidad,
    })),
    categoriaId: p.categoria?.id ?? "",
  };
}

/**
 * Normaliza un importe ingresado a string con punto decimal. Admite formato
 * es-AR: si hay coma, el punto se interpreta como separador de miles ("1.200,50"
 * → "1200.50"); si solo hay punto, ya es decimal ("1200.50").
 */
function normalizarImporte(valor: string): string {
  const v = valor.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

function esNumeroNoNegativo(valor: string): boolean {
  return /^\d+(\.\d+)?$/.test(valor) && Number(valor) >= 0;
}

function esNumeroPositivo(valor: string): boolean {
  return /^\d+(\.\d+)?$/.test(valor) && Number(valor) > 0;
}

/** Devuelve la lista de errores del formulario (vacía = válido). */
export function validarProducto(f: FormProducto): string[] {
  const errores: string[] = [];
  if (f.codigo.trim() === "") errores.push("El código es obligatorio.");
  if (f.nombre.trim() === "") errores.push("La descripción es obligatoria.");
  if (!esNumeroNoNegativo(normalizarImporte(f.precioVenta))) {
    errores.push("El precio de venta debe ser un número válido.");
  }
  if (!esNumeroNoNegativo(normalizarImporte(f.precioCosto))) {
    errores.push("El costo debe ser un número válido.");
  }
  if (f.tipo === "COMBO") {
    const items = f.componentes.filter((c) => c.componenteId !== "");
    if (items.length === 0) {
      errores.push("Un combo necesita al menos un componente.");
    }
    const ids = items.map((c) => c.componenteId);
    if (new Set(ids).size !== ids.length) {
      errores.push("El combo tiene componentes repetidos.");
    }
    if (items.some((c) => !esNumeroPositivo(normalizarImporte(c.cantidad)))) {
      errores.push("Cada componente necesita una cantidad positiva.");
    }
  }
  return errores;
}

/** Convierte un formulario válido en el payload que espera el servidor. */
export function aDatosProducto(f: FormProducto): DatosProducto {
  const descripcion = f.descripcion.trim();
  const esCombo = f.tipo === "COMBO";
  return {
    codigo: f.codigo.trim(),
    nombre: f.nombre.trim(),
    ...(descripcion !== "" ? { descripcion } : {}),
    precioVenta: normalizarImporte(f.precioVenta),
    precioCosto: normalizarImporte(f.precioCosto),
    tipoIva: f.tipoIva,
    tipo: f.tipo,
    ...(esCombo
      ? {
          componentes: f.componentes
            .filter((c) => c.componenteId !== "")
            .map((c) => ({
              componenteId: c.componenteId,
              cantidad: normalizarImporte(c.cantidad),
            })),
        }
      : {}),
    categoriaId: f.categoriaId === "" ? null : f.categoriaId,
  };
}

/** Margen de utilidad (%) sobre el costo, para mostrar en la tabla. `null` si no aplica. */
export function margenUtilidad(precioVenta: string, precioCosto: string): number | null {
  const venta = Number(precioVenta);
  const costo = Number(precioCosto);
  if (!Number.isFinite(venta) || !Number.isFinite(costo) || costo <= 0) return null;
  return ((venta - costo) / costo) * 100;
}
