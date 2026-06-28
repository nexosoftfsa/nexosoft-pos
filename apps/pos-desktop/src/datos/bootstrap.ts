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
}

export const DEFS: readonly DefProducto[] = [
  {
    id: "gaseosa",
    codigo: "7790001",
    descripcion: "Gaseosa 1,5 L",
    precio: "1850.00",
    costo: "1100",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "40",
  },
  {
    id: "agua",
    codigo: "7790002",
    descripcion: "Agua mineral 500 ml",
    precio: "900.00",
    costo: "520",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "60",
  },
  {
    id: "alfajor",
    codigo: "7790003",
    descripcion: "Alfajor triple",
    precio: "1200.00",
    costo: "700",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "50",
  },
  {
    id: "cafe",
    codigo: "7790004",
    descripcion: "Café molido 250 g",
    precio: "4300.00",
    costo: "2800",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "25",
  },
  {
    id: "leche",
    codigo: "7790005",
    descripcion: "Leche entera 1 L",
    precio: "1350.00",
    costo: "900",
    alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO,
    stock: "35",
  },
  {
    id: "pan",
    codigo: "7790006",
    descripcion: "Pan lactal",
    precio: "2100.00",
    costo: "1300",
    alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO,
    stock: "20",
  },
  {
    id: "yerba",
    codigo: "7790007",
    descripcion: "Yerba mate 1 kg",
    precio: "3800.00",
    costo: "2500",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "30",
  },
  {
    id: "galletitas",
    codigo: "7790008",
    descripcion: "Galletitas dulces",
    precio: "1500.00",
    costo: "850",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "45",
  },
];

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
  const repos = crearRepositoriosMemoria({ articulos, precios, existencias });
  const config = CONFIG_DEMO;

  const catalogo: ProductoCatalogo[] = articulos.map((articulo, i) => {
    const precio = precios[i];
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
  };
}
