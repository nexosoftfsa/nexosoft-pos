/**
 * Adaptador EN MEMORIA del ABM de catálogo, para el desarrollo en el navegador
 * (sin servidor de sucursal). Reproduce el contrato del cloud-api: alta valida
 * código duplicado (409), edición y baja por id. Sembrado con los productos demo
 * para poder ver y verificar la pantalla en el preview.
 */
import { ALICUOTAS_IVA, type AlicuotaIva } from "@nexosoft/domain";

import { DEFS } from "../datos/bootstrap";
import {
  ErrorCatalogoAdmin,
  type CategoriaAdmin,
  type ClienteCatalogoAdmin,
  type DatosProducto,
  type ProductoAdmin,
  type TipoIvaRemoto,
} from "./cliente-catalogo-admin";

function tipoIvaDeAlicuota(a: AlicuotaIva): TipoIvaRemoto {
  if (a === ALICUOTAS_IVA.CERO) return "EXENTO";
  if (a === ALICUOTAS_IVA.DIEZ_CON_CINCO) return "IVA_10_5";
  if (a === ALICUOTAS_IVA.VEINTISIETE) return "IVA_27";
  return "IVA_21";
}

const CATEGORIAS_DEMO: readonly CategoriaAdmin[] = [
  { id: "cat-bebidas", nombre: "Bebidas" },
  { id: "cat-almacen", nombre: "Almacén" },
  { id: "cat-panaderia", nombre: "Panadería" },
];

const CATEGORIA_POR_PRODUCTO: Record<string, string> = {
  gaseosa: "cat-bebidas",
  agua: "cat-bebidas",
  alfajor: "cat-almacen",
  cafe: "cat-almacen",
  leche: "cat-almacen",
  pan: "cat-panaderia",
  yerba: "cat-almacen",
  galletitas: "cat-panaderia",
};

function sembrarProductos(): ProductoAdmin[] {
  return DEFS.map((d) => {
    const catId = CATEGORIA_POR_PRODUCTO[d.id];
    const categoria = CATEGORIAS_DEMO.find((c) => c.id === catId) ?? null;
    return {
      id: d.id,
      codigo: d.codigo,
      nombre: d.descripcion,
      descripcion: null,
      precioVenta: d.precio,
      precioCosto: d.costo,
      tipoIva: tipoIvaDeAlicuota(d.alicuota),
      activo: true,
      categoria,
    };
  });
}

export class ClienteCatalogoAdminSimulado implements ClienteCatalogoAdmin {
  private productos: ProductoAdmin[];
  private readonly categorias: CategoriaAdmin[];
  private secuencia = 0;

  constructor() {
    this.productos = sembrarProductos();
    this.categorias = [...CATEGORIAS_DEMO];
  }

  async listarProductos(incluirInactivos: boolean): Promise<ProductoAdmin[]> {
    const lista = incluirInactivos ? this.productos : this.productos.filter((p) => p.activo);
    return lista.map((p) => ({ ...p }));
  }

  async crearProducto(datos: DatosProducto): Promise<ProductoAdmin> {
    if (this.productos.some((p) => p.codigo === datos.codigo)) {
      throw new ErrorCatalogoAdmin(`Ya existe un producto con código ${datos.codigo}`, 409);
    }
    const nuevo: ProductoAdmin = {
      id: `sim-${++this.secuencia}`,
      codigo: datos.codigo,
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      precioVenta: datos.precioVenta,
      precioCosto: datos.precioCosto,
      tipoIva: datos.tipoIva,
      activo: true,
      categoria: this.categorias.find((c) => c.id === datos.categoriaId) ?? null,
    };
    this.productos = [...this.productos, nuevo];
    return { ...nuevo };
  }

  async actualizarProducto(
    id: string,
    cambios: Partial<DatosProducto> & { readonly activo?: boolean },
  ): Promise<ProductoAdmin> {
    const actual = this.productos.find((p) => p.id === id);
    if (!actual) throw new ErrorCatalogoAdmin(`Producto ${id} no encontrado`, 404);
    const categoria =
      cambios.categoriaId !== undefined
        ? (this.categorias.find((c) => c.id === cambios.categoriaId) ?? null)
        : actual.categoria;
    const actualizado: ProductoAdmin = {
      ...actual,
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
      ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion ?? null } : {}),
      ...(cambios.precioVenta !== undefined ? { precioVenta: cambios.precioVenta } : {}),
      ...(cambios.precioCosto !== undefined ? { precioCosto: cambios.precioCosto } : {}),
      ...(cambios.tipoIva !== undefined ? { tipoIva: cambios.tipoIva } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
      categoria,
    };
    this.productos = this.productos.map((p) => (p.id === id ? actualizado : p));
    return { ...actualizado };
  }

  async desactivarProducto(id: string): Promise<void> {
    const actual = this.productos.find((p) => p.id === id);
    if (!actual) throw new ErrorCatalogoAdmin(`Producto ${id} no encontrado`, 404);
    this.productos = this.productos.map((p) => (p.id === id ? { ...p, activo: false } : p));
  }

  async listarCategorias(): Promise<CategoriaAdmin[]> {
    return this.categorias.map((c) => ({ ...c }));
  }
}
