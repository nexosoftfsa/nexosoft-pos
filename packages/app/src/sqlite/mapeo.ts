/**
 * Conversión entre filas SQLite y entidades de dominio. Centraliza las reglas de
 * serialización: dinero ↔ centavos (entero), cantidad ↔ texto decimal, alícuota ↔
 * porcentaje, fechas ↔ ISO, booleanos ↔ 0/1.
 */
import {
  alicuotaPorPorcentaje,
  Cantidad,
  ErrorDominio,
  Money,
  ModoPrecio,
  type AlicuotaIva,
  type Articulo,
  type Existencia,
  type PrecioArticulo,
  type UnidadDeMedida,
} from "@nexosoft/domain";

import type { Fila } from "./ejecutor-sql.js";

export function centavosAMoney(valor: unknown): Money {
  return Money.desdeCentavos(Number(valor));
}

export function alicuotaDeTexto(valor: unknown): AlicuotaIva {
  const alicuota = alicuotaPorPorcentaje(Number(valor));
  if (alicuota === undefined) {
    throw new ErrorDominio(
      "ALICUOTA_DESCONOCIDA",
      `Alícuota de IVA inválida en la base: ${String(valor)}`,
    );
  }
  return alicuota;
}

export function filaAArticulo(fila: Fila): Articulo {
  return {
    id: String(fila.id),
    codigoInterno: String(fila.codigo_interno),
    descripcion: String(fila.descripcion),
    unidadDeMedida: String(fila.unidad_de_medida) as UnidadDeMedida,
    costoNeto: centavosAMoney(fila.costo_neto_cent),
    alicuotaIva: alicuotaDeTexto(fila.alicuota_iva),
    activo: Number(fila.activo) === 1,
    ...(fila.codigo_barras != null ? { codigoBarras: String(fila.codigo_barras) } : {}),
    ...(fila.rubro_id != null ? { rubroId: String(fila.rubro_id) } : {}),
    ...(fila.proveedor_id != null ? { proveedorId: String(fila.proveedor_id) } : {}),
  };
}

export function filaAPrecioArticulo(fila: Fila): PrecioArticulo {
  const modo = String(fila.modo) as PrecioArticulo["modo"];
  return {
    articuloId: String(fila.articulo_id),
    listaId: String(fila.lista_id),
    modo,
    ...(modo === ModoPrecio.Manual && fila.precio_manual_cent != null
      ? { precioManual: centavosAMoney(fila.precio_manual_cent) }
      : {}),
    ...(modo === ModoPrecio.Margen && fila.margen_utilidad != null
      ? { margenUtilidad: Number(fila.margen_utilidad) }
      : {}),
  };
}

export function filaAExistencia(fila: Fila): Existencia {
  return {
    articuloId: String(fila.articulo_id),
    depositoId: String(fila.deposito_id),
    cantidad: Cantidad.de(String(fila.cantidad)),
    stockMinimo: Cantidad.de(String(fila.stock_minimo)),
  };
}
