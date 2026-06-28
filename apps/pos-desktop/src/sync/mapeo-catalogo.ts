/**
 * Mapeo del catálogo REMOTO (cloud-api / servidor de sucursal) al modelo de
 * dominio local. El cloud-api modela un `Producto` plano (codigo/nombre/
 * precioVenta/precioCosto/tipoIva); el dominio separa `Articulo` + `PrecioArticulo`
 * + `Existencia`. Acá traducimos producto → { articulo, precio }.
 *
 * Decisiones de mapeo (MVP, documentadas):
 *  - `codigo` del servidor → `codigoInterno` y también `codigoBarras` (el server lo
 *    define como "código de barras o interno"; así el lector funciona).
 *  - El servidor no tiene unidad de medida → se asume `Unidad`.
 *  - `precioVenta` es el precio final (IVA incluido, igual que `preciosIncluyenIva`).
 *  - `EXENTO` se mapea a alícuota 0% (el dominio no distingue exento de 0%).
 */
import {
  ALICUOTAS_IVA,
  crearArticulo,
  ModoPrecio,
  Money,
  UnidadDeMedida,
  type AlicuotaIva,
  type Articulo,
  type PrecioArticulo,
} from "@nexosoft/domain";

import { LISTA } from "../datos/bootstrap";

/** Valores del enum `TipoIva` del cloud-api (ver schema.prisma). */
export type TipoIvaRemoto = "EXENTO" | "IVA_10_5" | "IVA_21" | "IVA_27";

/** Producto tal como lo devuelve `GET /productos` del cloud-api. */
export interface ProductoRemoto {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly precioVenta: string;
  readonly precioCosto: string;
  readonly tipoIva: TipoIvaRemoto;
  readonly activo: boolean;
}

/** Saldo de stock tal como lo devuelve `GET /stock` del cloud-api. */
export interface SaldoRemoto {
  readonly producto: { readonly id: string };
  readonly saldo: string;
}

const ALICUOTA_POR_TIPO: Record<TipoIvaRemoto, AlicuotaIva> = {
  EXENTO: ALICUOTAS_IVA.CERO,
  IVA_10_5: ALICUOTAS_IVA.DIEZ_CON_CINCO,
  IVA_21: ALICUOTAS_IVA.VEINTIUNO,
  IVA_27: ALICUOTAS_IVA.VEINTISIETE,
};

export function mapearAlicuota(tipo: TipoIvaRemoto): AlicuotaIva {
  return ALICUOTA_POR_TIPO[tipo] ?? ALICUOTAS_IVA.VEINTIUNO;
}

/** Traduce un producto remoto a su `Articulo` + `PrecioArticulo` (lista por defecto). */
export function mapearProducto(p: ProductoRemoto): {
  articulo: Articulo;
  precio: PrecioArticulo;
} {
  const articulo = crearArticulo({
    id: p.id,
    codigoInterno: p.codigo,
    codigoBarras: p.codigo,
    descripcion: p.nombre,
    unidadDeMedida: UnidadDeMedida.Unidad,
    costoNeto: Money.desde(p.precioCosto),
    alicuotaIva: mapearAlicuota(p.tipoIva),
    activo: p.activo,
  });
  const precio: PrecioArticulo = {
    articuloId: p.id,
    listaId: LISTA,
    modo: ModoPrecio.Manual,
    precioManual: Money.desde(p.precioVenta),
  };
  return { articulo, precio };
}
