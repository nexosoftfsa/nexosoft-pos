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
import { MotorDeSincronizacion } from "@nexosoft/sync";
import type { SyncPos } from "../sync/useSync";
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

/** Crea el esquema del dominio y la tabla de la cola de sync (idempotente). */
export async function inicializarBaseTauri(ejecutor: EjecutorSql): Promise<void> {
  await crearEsquema(ejecutor);
  await crearTablaSync(ejecutor);
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
 * Siembra la base la PRIMERA vez (catálogo + config demo). Idempotente: si ya hay
 * artículos no hace nada. En 5.2b esto se reemplaza por un pull del servidor.
 */
export async function sembrarSiVacio(
  ejecutor: EjecutorSql,
  repos: RepositoriosSqlite,
): Promise<void> {
  const filas = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM articulo");
  if (Number(filas[0]?.n ?? 0) > 0) return;

  await guardarConfig(ejecutor, CONFIG_DEMO);
  await guardarDeposito(ejecutor, crearDeposito({ id: DEPOSITO, nombre: "Depósito principal" }));
  await guardarLista(
    ejecutor,
    crearListaDePrecios({ id: LISTA, nombre: "Minorista", tipo: TipoLista.Minorista, predeterminada: true }),
  );

  const { articulos, precios, existencias } = construirSemillaDemo();
  for (const a of articulos) await repos.articulos.guardar(a);
  for (const p of precios) await repos.precios.guardar(p);
  for (const e of existencias) await repos.existencias.guardar(e);
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
  /** Provee el JWT vigente para la sync (5.3). Por defecto devuelve null. */
  readonly obtenerToken?: () => string | null;
  /** Identificador de la terminal (5.3). Por defecto `caja-1`. */
  readonly terminalId?: string;
}

/** Arma el `EntornoPos` de producción sobre SQLite + sync HTTP. */
export async function crearEntornoPosTauri(opciones: OpcionesEntornoTauri = {}): Promise<EntornoPos> {
  const ejecutor = await EjecutorSqlTauri.abrir();
  await inicializarBaseTauri(ejecutor);
  const repos = crearRepositoriosSqlite(ejecutor);
  await sembrarSiVacio(ejecutor, repos);

  const config = await leerConfig(ejecutor);
  const catalogo = await leerCatalogo(ejecutor, repos, config);

  const almacen = new AlmacenSqlite(ejecutor);
  const cliente = new ClienteSyncHttp(
    opciones.baseUrlSync ?? URL_SYNC_DEFECTO,
    opciones.obtenerToken ?? (() => null),
  );
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
