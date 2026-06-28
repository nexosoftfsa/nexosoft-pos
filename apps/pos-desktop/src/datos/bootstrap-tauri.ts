/**
 * Bootstrap de PRODUCCIÓN: arma el `EntornoPos` dentro de la app Tauri sobre
 * SQLite real (`EjecutorSqlTauri`) + sincronización HTTP contra el servidor de
 * sucursal. La UI (`PantallaPos`) es la misma que en el navegador; solo cambia de
 * dónde salen los datos.
 *
 * Lo testeable (siembra, lectura de config/catálogo, venta transaccional) vive en
 * funciones que reciben un `EjecutorSql`, así se prueban con node:sqlite sin Tauri.
 * `crearEntornoPosTauri` solo las compone con el ejecutor real.
 *
 * Pendiente de fases siguientes:
 *  - 5.2b: el catálogo se siembra demo si la base está vacía; luego se reemplaza
 *    por un *pull* desde el servidor de sucursal.
 *  - 5.3: `terminalId` y el token JWT (hoy fijos / nulo) salen del login.
 */
import {
  crearEsquema,
  crearRepositoriosSqlite,
  guardarDeposito,
  guardarLista,
  ServicioDeFacturacion,
  ServicioDeVenta,
  filaAArticulo,
  type ComandoVenta,
  type ConfiguracionComercio,
  type EjecutorSql,
  type Fila,
  type RepositoriosSqlite,
  type VentaConfirmada,
} from "@nexosoft/app";
import {
  CondicionIva,
  crearDeposito,
  crearListaDePrecios,
  Money,
  resolverPrecioArticulo,
  TipoLista,
} from "@nexosoft/domain";
import { MockServicioFiscal } from "@nexosoft/fiscal";
import { MockImpresoraTermica, MockLectorDeBarras } from "@nexosoft/hardware";
import { MockPasarelaDePago } from "@nexosoft/pagos";
import { AlmacenSqlite, crearTablaSync } from "../sync/almacen-sqlite";
import { ClienteSyncHttp } from "../sync/cliente-sync-http";
import { ClienteCatalogoHttp, type ClienteCatalogo } from "../sync/cliente-catalogo-http";
import { MotorDeSincronizacion } from "@nexosoft/sync";
import type { SyncPos } from "../sync/useSync";
import { sincronizarCatalogo } from "./catalogo-pull";
import { crearTablaSesion } from "./sesion-sqlite";
import {
  CONFIG_DEMO,
  construirSemillaDemo,
  DEPOSITO,
  LISTA,
  type EntornoPos,
  type ProductoCatalogo,
} from "./bootstrap";
import { EjecutorSqlTauri } from "./ejecutor-sql-tauri";

const URL_SYNC_DEFECTO = "http://localhost:3000/api/v1";
const TERMINAL_DEFECTO = "caja-1";

/** Crea el esquema del dominio + la cola de sync + la tabla de sesión (idempotente). */
export async function inicializarBaseTauri(ejecutor: EjecutorSql): Promise<void> {
  await crearEsquema(ejecutor);
  await crearTablaSync(ejecutor);
  await crearTablaSesion(ejecutor);
}

interface FilaConfig extends Fila {
  cuit: string;
  razon_social: string;
  condicion_iva_emisor: string;
  punto_de_venta: number;
  deposito_por_defecto: string;
  lista_predeterminada: string;
  precios_incluyen_iva: number;
  permitir_stock_negativo: number;
}

/** Guarda (alta/actualización) la configuración del comercio (fila única id=1). */
export async function guardarConfig(
  ejecutor: EjecutorSql,
  config: ConfiguracionComercio,
): Promise<void> {
  await ejecutor.ejecutar(
    `INSERT INTO comercio_config
       (id, cuit, razon_social, condicion_iva_emisor, punto_de_venta,
        deposito_por_defecto, lista_predeterminada, precios_incluyen_iva, permitir_stock_negativo)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cuit=excluded.cuit, razon_social=excluded.razon_social,
       condicion_iva_emisor=excluded.condicion_iva_emisor, punto_de_venta=excluded.punto_de_venta,
       deposito_por_defecto=excluded.deposito_por_defecto, lista_predeterminada=excluded.lista_predeterminada,
       precios_incluyen_iva=excluded.precios_incluyen_iva, permitir_stock_negativo=excluded.permitir_stock_negativo`,
    [
      config.cuit,
      config.razonSocial,
      config.condicionIvaEmisor,
      config.puntoDeVenta,
      config.depositoPorDefectoId,
      config.listaPredeterminadaId,
      config.preciosIncluyenIva ? 1 : 0,
      config.permitirStockNegativo ? 1 : 0,
    ],
  );
}

/** Lee la configuración del comercio. Lanza si no está sembrada. */
export async function leerConfig(ejecutor: EjecutorSql): Promise<ConfiguracionComercio> {
  const filas = await ejecutor.consultar<FilaConfig>("SELECT * FROM comercio_config WHERE id = 1");
  const f = filas[0];
  if (f === undefined) {
    throw new Error("No hay configuración de comercio en la base.");
  }
  return {
    cuit: f.cuit,
    razonSocial: f.razon_social,
    condicionIvaEmisor: f.condicion_iva_emisor as CondicionIva,
    puntoDeVenta: Number(f.punto_de_venta),
    depositoPorDefectoId: f.deposito_por_defecto,
    listaPredeterminadaId: f.lista_predeterminada,
    preciosIncluyenIva: f.precios_incluyen_iva === 1,
    permitirStockNegativo: f.permitir_stock_negativo === 1,
  };
}

/**
 * Asegura la config del comercio + depósito + lista por defecto (idempotente).
 * Es independiente del catálogo: hace falta SIEMPRE (también con pull del servidor).
 */
export async function asegurarMaestros(ejecutor: EjecutorSql): Promise<void> {
  const filas = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM comercio_config");
  if (Number(filas[0]?.n ?? 0) === 0) {
    await guardarConfig(ejecutor, CONFIG_DEMO);
  }
  await guardarDeposito(ejecutor, crearDeposito({ id: DEPOSITO, nombre: "Depósito principal" }));
  await guardarLista(
    ejecutor,
    crearListaDePrecios({ id: LISTA, nombre: "Minorista", tipo: TipoLista.Minorista, predeterminada: true }),
  );
}

/** ¿La base no tiene artículos? (decide aprovisionamiento inicial vs refresco). */
export async function catalogoVacio(ejecutor: EjecutorSql): Promise<boolean> {
  const filas = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM articulo");
  return Number(filas[0]?.n ?? 0) === 0;
}

/** Siembra el catálogo demo si no hay artículos. Fallback offline (sin servidor). */
export async function sembrarCatalogoDemoSiVacio(
  ejecutor: EjecutorSql,
  repos: RepositoriosSqlite,
): Promise<void> {
  if (!(await catalogoVacio(ejecutor))) return;
  const { articulos, precios, existencias } = construirSemillaDemo();
  for (const a of articulos) await repos.articulos.guardar(a);
  for (const p of precios) await repos.precios.guardar(p);
  for (const e of existencias) await repos.existencias.guardar(e);
}

/** Siembra demo completa (maestros + catálogo). Fallback offline y uso en tests. */
export async function sembrarSiVacio(
  ejecutor: EjecutorSql,
  repos: RepositoriosSqlite,
): Promise<void> {
  await asegurarMaestros(ejecutor);
  await sembrarCatalogoDemoSiVacio(ejecutor, repos);
}

/** Lee el catálogo activo desde SQLite y resuelve el precio final de cada artículo. */
export async function leerCatalogo(
  ejecutor: EjecutorSql,
  repos: RepositoriosSqlite,
  config: ConfiguracionComercio,
): Promise<ProductoCatalogo[]> {
  const filas = await ejecutor.consultar("SELECT * FROM articulo WHERE activo = 1 ORDER BY descripcion");
  const catalogo: ProductoCatalogo[] = [];
  for (const fila of filas) {
    const articulo = filaAArticulo(fila);
    const precio = await repos.precios.obtener(articulo.id, config.listaPredeterminadaId);
    catalogo.push({
      articulo,
      precioFinal:
        precio !== undefined
          ? resolverPrecioArticulo(precio, articulo, { condicionEmisor: config.condicionIvaEmisor })
          : Money.cero(),
    });
  }
  return catalogo;
}

/**
 * `ServicioDeVenta` que confirma DENTRO de una transacción SQLite (ADR-0023), para
 * que venta + ítems + pagos + movimientos + descuento de stock se guarden juntos.
 * No toca el dominio: reconstruye los repos sobre el ejecutor de la transacción.
 */
export class ServicioDeVentaTransaccional extends ServicioDeVenta {
  constructor(
    private readonly ejecutorTx: EjecutorSqlTauri,
    private readonly configuracion: ConfiguracionComercio,
    repos: RepositoriosSqlite,
  ) {
    super(repos, configuracion);
  }

  override confirmarVenta(comando: ComandoVenta): Promise<VentaConfirmada> {
    return this.ejecutorTx.transaccion((ejecutor) => {
      const reposTx = crearRepositoriosSqlite(ejecutor);
      return new ServicioDeVenta(reposTx, this.configuracion).confirmarVenta(comando);
    });
  }
}

export interface OpcionesEntornoTauri {
  /** Base del cloud-api de la sucursal. Por defecto `http://localhost:3000/api/v1`. */
  readonly baseUrlSync?: string;
  /** Provee el JWT vigente para la sync y el pull (5.3). Por defecto devuelve null. */
  readonly obtenerToken?: () => string | null;
  /** Identificador de la terminal (5.3). Por defecto `caja-1`. */
  readonly terminalId?: string;
  /** Cliente de catálogo inyectable (override/test). Por defecto, HTTP. */
  readonly clienteCatalogo?: ClienteCatalogo;
}

/**
 * Pull del catálogo dentro de una transacción (atómico). Offline-first: si no hay
 * sesión o falla la red, NO rompe el arranque (devuelve false y se sigue con lo
 * que haya en local). En base vacía aprovisiona el stock desde el servidor.
 */
async function intentarPullCatalogo(
  ejecutor: EjecutorSqlTauri,
  config: ConfiguracionComercio,
  cliente: ClienteCatalogo,
): Promise<boolean> {
  try {
    const reemplazarStock = await catalogoVacio(ejecutor);
    await ejecutor.transaccion((ej) =>
      sincronizarCatalogo(crearRepositoriosSqlite(ej), cliente, config, { reemplazarStock }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Arma el `EntornoPos` de producción sobre SQLite + sync HTTP. */
export async function crearEntornoPosTauri(opciones: OpcionesEntornoTauri = {}): Promise<EntornoPos> {
  const ejecutor = await EjecutorSqlTauri.abrir();
  await inicializarBaseTauri(ejecutor);
  const repos = crearRepositoriosSqlite(ejecutor);
  await asegurarMaestros(ejecutor);
  const config = await leerConfig(ejecutor);

  const obtenerToken = opciones.obtenerToken ?? (() => null);
  const baseUrl = opciones.baseUrlSync ?? URL_SYNC_DEFECTO;
  const clienteCatalogo =
    opciones.clienteCatalogo ?? new ClienteCatalogoHttp(baseUrl, obtenerToken);

  // Con sesión: pull del catálogo del servidor (fuente de verdad). Sin sesión o
  // sin red: fallback al catálogo demo si la base está vacía.
  const pulled = obtenerToken() !== null && (await intentarPullCatalogo(ejecutor, config, clienteCatalogo));
  if (!pulled) {
    await sembrarCatalogoDemoSiVacio(ejecutor, repos);
  }

  const catalogo = await leerCatalogo(ejecutor, repos, config);

  const almacen = new AlmacenSqlite(ejecutor);
  const cliente = new ClienteSyncHttp(baseUrl, obtenerToken);
  const sync: SyncPos = {
    motor: new MotorDeSincronizacion(almacen, cliente),
    almacen,
    terminalId: opciones.terminalId ?? TERMINAL_DEFECTO,
  };

  return {
    servicio: new ServicioDeVentaTransaccional(ejecutor, config, repos),
    facturacion: new ServicioDeFacturacion(repos, config, new MockServicioFiscal()),
    config,
    catalogo,
    impresora: new MockImpresoraTermica(),
    lector: new MockLectorDeBarras(),
    pasarela: new MockPasarelaDePago(),
    sync,
  };
}
