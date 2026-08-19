/**
 * Adaptador EN MEMORIA del ABM de catálogo, para el desarrollo en el navegador
 * (sin servidor de sucursal). Reproduce el contrato del cloud-api: alta valida
 * código duplicado (409) y las reglas de combo (Fase 8.1), edición y baja por id.
 * Sembrado con los productos demo (incluye un combo) para ver la pantalla en el
 * preview.
 */
import { ALICUOTAS_IVA, type AlicuotaIva } from "@nexosoft/domain";

import { DEFS, rubroASlug } from "../datos/bootstrap";
import {
  COLUMNAS_IMPORTAR_CATALOGO as COL,
  ErrorCatalogoAdmin,
  type CategoriaAdmin,
  type ClienteCatalogoAdmin,
  type ComponenteAdmin,
  type DatosProducto,
  type FilaImportacion,
  type ProductoAdmin,
  type TipoIvaRemoto,
} from "./cliente-catalogo-admin";

function tipoIvaDeAlicuota(a: AlicuotaIva): TipoIvaRemoto {
  if (a === ALICUOTAS_IVA.CERO) return "EXENTO";
  if (a === ALICUOTAS_IVA.DIEZ_CON_CINCO) return "IVA_10_5";
  if (a === ALICUOTAS_IVA.VEINTISIETE) return "IVA_27";
  return "IVA_21";
}

/** Fase 14.B (demo): "% IVA" de un Excel importado → alícuota. Desconocido cae en 21% (el cloud-api real es estricto). */
function tipoIvaDePorcentaje(porcentaje: number): TipoIvaRemoto {
  if (porcentaje === 0) return "EXENTO";
  if (porcentaje === 10 || porcentaje === 10.5) return "IVA_10_5";
  if (porcentaje === 27) return "IVA_27";
  return "IVA_21";
}

/** Categorías = rubros reales distintos del catálogo demo (Fase 10, 711 artículos del cliente). */
const CATEGORIAS_DEMO: readonly CategoriaAdmin[] = [
  ...new Map(DEFS.map((d) => [rubroASlug(d.rubro), d.rubro])),
].map(([id, nombre]) => ({ id, nombre }));

/** Productos demo que se gestionan por lotes (perecederos). */
const PERECEDEROS = new Set(["leche", "pan"]);

function sembrarProductos(): ProductoAdmin[] {
  const simples = DEFS.map((d): ProductoAdmin => {
    const categoria = CATEGORIAS_DEMO.find((c) => c.id === rubroASlug(d.rubro)) ?? null;
    return {
      id: d.id,
      codigo: d.codigo,
      nombre: d.descripcion,
      descripcion: null,
      precioVenta: d.precio,
      precioCosto: d.costo,
      tipoIva: tipoIvaDeAlicuota(d.alicuota),
      tipo: "SIMPLE",
      requiereLote: PERECEDEROS.has(d.id),
      activo: true,
      categoria,
    };
  });

  // Combo demo: café + alfajor (si ambos existen en la semilla).
  const cafe = simples.find((p) => p.id === "cafe");
  const alfajor = simples.find((p) => p.id === "alfajor");
  if (cafe && alfajor) {
    simples.push({
      id: "combo-merienda",
      codigo: "COMBO1",
      nombre: "Combo Merienda",
      descripcion: "Café + alfajor",
      precioVenta: "3200.00",
      precioCosto: "2000.00",
      tipoIva: "IVA_21",
      tipo: "COMBO",
      requiereLote: false,
      activo: true,
      categoria: CATEGORIAS_DEMO.find((c) => c.id === "cat-almacen") ?? null,
      componentes: [
        { componenteId: cafe.id, cantidad: "1", componente: snapshot(cafe) },
        { componenteId: alfajor.id, cantidad: "1", componente: snapshot(alfajor) },
      ],
    });
  }
  return simples;
}

function snapshot(p: ProductoAdmin): NonNullable<ComponenteAdmin["componente"]> {
  return { id: p.id, codigo: p.codigo, nombre: p.nombre };
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
    const esCombo = datos.tipo === "COMBO";
    const componentes = esCombo ? this.validarComponentes(datos.componentes) : undefined;
    const nuevo: ProductoAdmin = {
      id: `sim-${++this.secuencia}`,
      codigo: datos.codigo,
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      precioVenta: datos.precioVenta,
      precioCosto: datos.precioCosto,
      tipoIva: datos.tipoIva,
      tipo: esCombo ? "COMBO" : "SIMPLE",
      requiereLote: datos.requiereLote ?? false,
      activo: true,
      categoria: this.categorias.find((c) => c.id === datos.categoriaId) ?? null,
      ...(componentes !== undefined ? { componentes } : {}),
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
    if (cambios.componentes !== undefined && actual.tipo !== "COMBO") {
      throw new ErrorCatalogoAdmin("Solo un combo puede tener componentes.", 400);
    }
    const categoria =
      cambios.categoriaId !== undefined
        ? (this.categorias.find((c) => c.id === cambios.categoriaId) ?? null)
        : actual.categoria;
    const componentes =
      cambios.componentes !== undefined
        ? this.validarComponentes(cambios.componentes)
        : actual.componentes;
    const actualizado: ProductoAdmin = {
      ...actual,
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
      ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion ?? null } : {}),
      ...(cambios.precioVenta !== undefined ? { precioVenta: cambios.precioVenta } : {}),
      ...(cambios.precioCosto !== undefined ? { precioCosto: cambios.precioCosto } : {}),
      ...(cambios.tipoIva !== undefined ? { tipoIva: cambios.tipoIva } : {}),
      ...(cambios.requiereLote !== undefined ? { requiereLote: cambios.requiereLote } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
      ...(componentes !== undefined ? { componentes } : {}),
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

  /**
   * Fase 14.B, versión demo: reproduce las reglas esenciales del backend
   * (código requerido, categoría por nombre creada si falta, duplicado se
   * omite) sin pasar por `mapearArticulo` (vive en cloud-api, no es parte
   * del bundle del POS). Suficiente para probar la pantalla en el navegador
   * sin servidor; la validación real la hace siempre el cloud-api.
   */
  async importarProductos(filas: readonly Record<string, string>[], dryRun: boolean): Promise<FilaImportacion[]> {
    const productos = [...this.productos];
    const categorias = [...this.categorias];
    const resultados: FilaImportacion[] = [];

    filas.forEach((cruda, i) => {
      const fila = i + 2;
      const codigo = (cruda[COL.codigo] ?? "").trim();
      const nombre = (cruda[COL.descripcion] ?? "").trim();
      if (codigo === "") {
        resultados.push({ fila, resultado: "error", mensaje: "Fila sin código: no se puede importar." });
        return;
      }
      if (nombre === "") {
        resultados.push({ fila, resultado: "error", mensaje: `Artículo ${codigo} sin descripción.` });
        return;
      }
      if (productos.some((p) => p.codigo === codigo)) {
        resultados.push({ fila, resultado: "omitida", mensaje: `Ya existe un producto con código ${codigo}` });
        return;
      }

      const nombreRubro = cruda[COL.rubro]?.trim() || "Sin Clasificar";
      let categoria = categorias.find((c) => c.nombre === nombreRubro);
      if (!categoria) {
        categoria = { id: `sim-cat-${categorias.length + 1}`, nombre: nombreRubro };
        categorias.push(categoria);
      }

      productos.push({
        id: `sim-${productos.length + 1}`,
        codigo,
        nombre,
        descripcion: null,
        precioVenta: Number(cruda[COL.precioVenta] ?? 0).toFixed(2),
        precioCosto: Number(cruda[COL.precioCosto] ?? 0).toFixed(2),
        tipoIva: tipoIvaDePorcentaje(Number(cruda[COL.porcentajeIva] ?? 0)),
        tipo: "SIMPLE",
        requiereLote: false,
        activo: (cruda[COL.activo] ?? "S").trim().toUpperCase() !== "N",
        categoria,
      });
      resultados.push({ fila, resultado: "creada" });
    });

    if (!dryRun) {
      this.productos = productos;
      this.categorias.splice(0, this.categorias.length, ...categorias);
    }
    return resultados;
  }

  /** Valida los componentes de un combo igual que el cloud-api (400 si algo falla). */
  private validarComponentes(
    componentes: ReadonlyArray<{ componenteId: string; cantidad: string }> | undefined,
  ): ComponenteAdmin[] {
    if (!componentes || componentes.length === 0) {
      throw new ErrorCatalogoAdmin("Un combo necesita al menos un componente.", 400);
    }
    const ids = componentes.map((c) => c.componenteId);
    if (new Set(ids).size !== ids.length) {
      throw new ErrorCatalogoAdmin("El combo tiene componentes repetidos.", 400);
    }
    return componentes.map((c) => {
      const prod = this.productos.find((p) => p.id === c.componenteId);
      if (!prod) throw new ErrorCatalogoAdmin(`El componente ${c.componenteId} no existe.`, 400);
      if (prod.tipo === "COMBO") {
        throw new ErrorCatalogoAdmin("Un combo no puede incluir otro combo.", 400);
      }
      if (Number(c.cantidad) <= 0) {
        throw new ErrorCatalogoAdmin("La cantidad de cada componente debe ser positiva.", 400);
      }
      return { componenteId: c.componenteId, cantidad: c.cantidad, componente: snapshot(prod) };
    });
  }
}
