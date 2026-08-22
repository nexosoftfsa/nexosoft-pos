/**
 * Arranque del entorno del POS para desarrollo en el navegador: catálogo demo +
 * repositorios EN MEMORIA + `ServicioDeVenta`. Cuando el POS corra dentro de Tauri
 * se reemplaza esta fábrica por una que use el adaptador SQLite (`EjecutorSql`
 * sobre `@tauri-apps/plugin-sql`); la UI no cambia.
 */
import {
  crearRepositoriosMemoria,
  ServicioDeFacturacion,
  ServicioDeVenta,
  type ComponenteDeCombo,
  type ConfiguracionComercio,
} from "@nexosoft/app";
import { MockServicioFiscal } from "@nexosoft/fiscal";
import {
  MockImpresoraTermica,
  MockLectorDeBarras,
  type ImpresoraTermica,
  type LectorDeBarras,
} from "@nexosoft/hardware";
import { MockPasarelaDePago, type PasarelaDePago } from "@nexosoft/pagos";
import { AlmacenEnMemoria, MotorDeSincronizacion } from "@nexosoft/sync";
import { ClienteSyncSimulado } from "../sync/cliente-sync-simulado";
import type { SyncPos } from "../sync/useSync";
import {
  ALICUOTAS_IVA,
  alicuotaPorPorcentaje,
  Cantidad,
  CondicionIva,
  crearArticulo,
  crearExistencia,
  ModoPrecio,
  Money,
  resolverPrecioArticulo,
  UnidadDeMedida,
  type AlicuotaIva,
  type Articulo,
  type Existencia,
  type PrecioArticulo,
} from "@nexosoft/domain";
import catalogoDemo711 from "./catalogo-demo-711.json";

export const DEPOSITO = "principal";
export const LISTA = "minorista";

export interface DefProducto {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  /** Precio final IVA incluido. */
  readonly precio: string;
  readonly costo: string;
  readonly alicuota: AlicuotaIva;
  readonly stock: string;
  readonly rubro: string;
}

/** Id estable derivado de un nombre de rubro (para agrupar sin depender de una tabla aparte). */
export function rubroASlug(rubro: string): string {
  return rubro
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // saca acentos (NFD los separa en marcas combinantes)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface DefProductoCrudo {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly precio: string;
  readonly costo: string;
  readonly porcentajeIva: number;
  readonly stock: string;
  readonly rubro: string;
}

/**
 * Catálogo demo = los 711 artículos REALES del cliente de la Fase 10 (su
 * propio Excel exportado, ver `Migrar Articulos.xlsx` y el importador de la
 * 10.2), no data inventada. `catalogo-demo-711.json` se genera con
 * `scripts/generar-catalogo-demo.py` (Python, mismo patrón que
 * `apps/cloud-api/scripts/padron/`) y ya viene con 5 ids especiales
 * ("alfajor"/"gaseosa"/"cafe"/"leche"/"pan") apuntando a productos reales
 * (Alfajor Genio Triple Negro, Coca Cola Retornable 1.5L, Café La Virginia,
 * Leche Entera Baggio, Pan Lactal La Reina) para no romper el combo demo
 * (`combo-merienda`), `PROMOS_DEMO` (`componentes/promos.ts`) ni los
 * perecederos con lotes de `cliente-stock-simulado.ts` /
 * `cliente-catalogo-admin-simulado.ts`, que referencian esos ids.
 */
export const DEFS: readonly DefProducto[] = (catalogoDemo711 as readonly DefProductoCrudo[]).map(
  (d) => ({
    id: d.id,
    codigo: d.codigo,
    descripcion: d.descripcion,
    precio: d.precio,
    costo: d.costo,
    alicuota: alicuotaPorPorcentaje(d.porcentajeIva) ?? ALICUOTAS_IVA.VEINTIUNO,
    stock: d.stock,
    rubro: d.rubro,
  }),
);

export interface ProductoCatalogo {
  readonly articulo: Articulo;
  /** Precio final IVA incluido, ya resuelto para la lista por defecto. */
  readonly precioFinal: Money;
}

export interface EntornoPos {
  readonly servicio: ServicioDeVenta;
  readonly facturacion: ServicioDeFacturacion;
  readonly config: ConfiguracionComercio;
  readonly catalogo: readonly ProductoCatalogo[];
  readonly impresora: ImpresoraTermica;
  readonly lector: LectorDeBarras;
  readonly pasarela: PasarelaDePago;
  readonly sync: SyncPos;
  /** Fase 17: toggle local de la estrella "grilla rápida" (nunca sincroniza). */
  readonly grillaRapida: ServicioGrillaRapida;
}

/** Puerto local (Fase 17) para marcar/desmarcar un artículo en la grilla rápida. */
export interface ServicioGrillaRapida {
  establecer(articuloId: string, valor: boolean): Promise<void>;
}

/** Configuración del comercio para la demo (igual en navegador y semilla SQLite). */
export const CONFIG_DEMO: ConfiguracionComercio = {
  cuit: "30-71234567-8",
  razonSocial: "NexoSoft Almacén (demo)",
  condicionIvaEmisor: CondicionIva.ResponsableInscripto,
  puntoDeVenta: 1,
  depositoPorDefectoId: DEPOSITO,
  listaPredeterminadaId: LISTA,
  preciosIncluyenIva: true,
  permitirStockNegativo: false,
  emiteComprobantesFiscales: true,
};

/**
 * Construye el catálogo demo (artículos + precios + existencias) a partir de
 * `DEFS`. Lo usan tanto el bootstrap en memoria (navegador) como la siembra
 * inicial de SQLite en Tauri (`bootstrap-tauri.ts`).
 */
export function construirSemillaDemo(): {
  articulos: Articulo[];
  precios: PrecioArticulo[];
  existencias: Existencia[];
} {
  const articulos: Articulo[] = [];
  const precios: PrecioArticulo[] = [];
  const existencias: Existencia[] = [];

  for (const d of DEFS) {
    articulos.push(
      crearArticulo({
        id: d.id,
        codigoInterno: d.codigo,
        descripcion: d.descripcion,
        unidadDeMedida: UnidadDeMedida.Unidad,
        costoNeto: Money.desde(d.costo),
        alicuotaIva: d.alicuota,
        rubroId: rubroASlug(d.rubro),
      }),
    );
    precios.push({
      articuloId: d.id,
      listaId: LISTA,
      modo: ModoPrecio.Manual,
      precioManual: Money.desde(d.precio),
    });
    existencias.push(
      crearExistencia({
        articuloId: d.id,
        depositoId: DEPOSITO,
        cantidad: Cantidad.de(d.stock),
      }),
    );
  }
  return { articulos, precios, existencias };
}

export function crearEntornoPos(): EntornoPos {
  const { articulos, precios, existencias } = construirSemillaDemo();
  const config = CONFIG_DEMO;

  // Combo demo (Fase 8.1.b): es un artículo vendible sin stock propio; al
  // venderlo se descuenta el stock de sus componentes (café + alfajor).
  const comboArticulo = crearArticulo({
    id: "combo-merienda",
    codigoInterno: "COMBO1",
    descripcion: "Combo Merienda",
    unidadDeMedida: UnidadDeMedida.Unidad,
    costoNeto: Money.desde("2000"),
    alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
  });
  const comboPrecio: PrecioArticulo = {
    articuloId: comboArticulo.id,
    listaId: LISTA,
    modo: ModoPrecio.Manual,
    precioManual: Money.desde("3200.00"),
  };
  const combos = new Map<string, readonly ComponenteDeCombo[]>([
    [
      comboArticulo.id,
      [
        { articuloId: "cafe", cantidad: Cantidad.de("1") },
        { articuloId: "alfajor", cantidad: Cantidad.de("1") },
      ],
    ],
  ]);

  const articulosCatalogo = [...articulos, comboArticulo];
  const preciosCatalogo = [...precios, comboPrecio];
  const repos = crearRepositoriosMemoria({
    articulos: articulosCatalogo,
    precios: preciosCatalogo,
    existencias,
    combos,
  });

  const catalogo: ProductoCatalogo[] = articulosCatalogo.map((articulo, i) => {
    const precio = preciosCatalogo[i];
    return {
      articulo,
      precioFinal:
        precio !== undefined
          ? resolverPrecioArticulo(precio, articulo, {
              condicionEmisor: config.condicionIvaEmisor,
            })
          : Money.cero(),
    };
  });

  // Sincronización. En el navegador (dev) la cola vive en memoria y el cliente
  // está SIMULADO (acepta tras una demora) para ver el ciclo en la UI. En Tauri
  // se reemplaza por `AlmacenSqlite` (plugin-sql) + `ClienteSyncHttp` (servidor
  // de sucursal), sin tocar la UI.
  const almacen = new AlmacenEnMemoria();
  const motor = new MotorDeSincronizacion(almacen, new ClienteSyncSimulado({ demoraMs: 800 }));
  const sync: SyncPos = { motor, almacen, terminalId: "caja-1" };

  return {
    servicio: new ServicioDeVenta(repos, config),
    facturacion: new ServicioDeFacturacion(repos, config, new MockServicioFiscal()),
    config,
    catalogo,
    impresora: new MockImpresoraTermica(),
    lector: new MockLectorDeBarras(),
    pasarela: new MockPasarelaDePago(),
    sync,
    grillaRapida: {
      establecer: (articuloId, valor) => repos.articulos.establecerGrillaRapida(articuloId, valor),
    },
  };
}
