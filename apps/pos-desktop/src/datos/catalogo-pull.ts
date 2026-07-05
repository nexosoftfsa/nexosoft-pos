/**
 * Pull del catálogo: descarga productos+stock del servidor de sucursal y los
 * persiste en el SQLite local (offline-first). El servidor es la fuente de verdad
 * del CATÁLOGO (artículos + precios): se upsertean siempre.
 *
 * El STOCK es más delicado: entre sincronizaciones el saldo local cambia por las
 * ventas offline aún no subidas. Por eso, por defecto, solo se inicializa el saldo
 * de un artículo cuando NO existe localmente (alta nueva); los existentes se
 * respetan. Con `reemplazarStock` (aprovisionamiento inicial de una terminal) se
 * pisa con el saldo del servidor. La reconciliación fina de stock entre terminales
 * queda para una fase posterior.
 */
import { Cantidad, crearExistencia } from "@nexosoft/domain";
import type { ConfiguracionComercio, RepositoriosSqlite } from "@nexosoft/app";

import type { ClienteCatalogo } from "../sync/cliente-catalogo-http";
import { mapearProducto } from "../sync/mapeo-catalogo";

export interface OpcionesPull {
  /** Si es true, pisa el stock local con el saldo del servidor (aprovisionamiento). */
  readonly reemplazarStock?: boolean;
}

export interface ResultadoPull {
  readonly productos: number;
  readonly stockInicializado: number;
}

/** Descarga el catálogo del servidor y lo vuelca en los repos locales. */
export async function sincronizarCatalogo(
  repos: RepositoriosSqlite,
  cliente: ClienteCatalogo,
  config: ConfiguracionComercio,
  opciones: OpcionesPull = {},
): Promise<ResultadoPull> {
  const [productos, saldos] = await Promise.all([
    cliente.descargarProductos(),
    cliente.descargarStock(),
  ]);
  const saldoPorId = new Map(saldos.map((s) => [s.producto.id, s.saldo]));
  const deposito = config.depositoPorDefectoId;

  let stockInicializado = 0;
  for (const p of productos) {
    const { articulo, precio } = mapearProducto(p);
    await repos.articulos.guardar(articulo);
    await repos.precios.guardar(precio);

    // Los combos no tienen stock propio: se persisten sus componentes y se
    // omite la existencia (su stock se descuenta de los componentes al vender).
    if (p.tipo === "COMBO") {
      await repos.combos.reemplazar(
        p.id,
        (p.componentes ?? []).map((c) => ({
          articuloId: c.componenteId,
          cantidad: Cantidad.de(c.cantidad),
        })),
      );
      continue;
    }

    const existente = await repos.existencias.obtener(articulo.id, deposito);
    if (existente === undefined || opciones.reemplazarStock === true) {
      const saldo = saldoPorId.get(p.id) ?? "0";
      await repos.existencias.guardar(
        crearExistencia({ articuloId: articulo.id, depositoId: deposito, cantidad: Cantidad.de(saldo) }),
      );
      stockInicializado++;
    }
  }

  return { productos: productos.length, stockInicializado };
}
