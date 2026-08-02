/**
 * Fase 10.2 (ADR pendiente): mapeo PURO de una fila de catálogo exportada por
 * el sistema anterior de un comercio (Excel/CSV) al `CrearProductoDto` del
 * cloud-api. Sin I/O — el script `scripts/importar-catalogo.mjs` lee el
 * archivo, llama a `mapearArticulo` por fila, y hace las llamadas HTTP.
 *
 * Diseñado a partir del archivo real de un comercio (711 artículos): columnas
 * "Código de barras / Descripción / Rubro / Precio Costo / % IVA / Precio
 * Venta / Stock / Control Stock / Activo". Si otro cliente exporta con
 * nombres de columna distintos, el ADAPTADOR que arma `FilaCatalogo` cambia
 * (en el script), pero esta función y sus reglas de negocio no.
 */

export type TipoIvaImportado = 'EXENTO' | 'IVA_10_5' | 'IVA_21' | 'IVA_27';

/** Una fila de catálogo ya normalizada a los campos que importan (agnóstica del formato de origen). */
export interface FilaCatalogo {
  readonly codigo: string | number;
  readonly descripcion: string;
  readonly rubro: string | null | undefined;
  readonly precioCosto: number;
  readonly porcentajeIva: number;
  readonly precioVenta: number;
  /** Cantidad en stock del sistema anterior. Puede venir negativa (dato sucio) o fraccionada (venta por peso). */
  readonly stock: number;
  /** "S"/"N" tal como lo exporta el sistema anterior. Ausente = activo. */
  readonly activo?: string | null;
}

export interface ArticuloAImportar {
  readonly codigo: string;
  readonly nombre: string;
  readonly precioVenta: string;
  readonly precioCosto: string;
  readonly tipoIva: TipoIvaImportado;
  readonly categoriaNombre: string;
  readonly activo: boolean;
  /** `null` = no hay que sembrar stock inicial (stock <= 0 en el origen). */
  readonly stockInicial: string | null;
  readonly advertencias: readonly string[];
}

const CATEGORIA_DEFECTO = 'Sin Clasificar';
const LARGO_MAX_NOMBRE = 200;

/** % IVA del sistema anterior → alícuota de NexoSoft. Lanza si no reconoce el valor (dato a revisar a mano). */
export function mapearAlicuota(porcentajeIva: number): TipoIvaImportado {
  if (porcentajeIva === 0) return 'EXENTO';
  if (porcentajeIva === 10 || porcentajeIva === 10.5) return 'IVA_10_5';
  if (porcentajeIva === 21) return 'IVA_21';
  if (porcentajeIva === 27) return 'IVA_27';
  throw new Error(`% IVA no reconocido: ${porcentajeIva}`);
}

/** Mapea una fila del catálogo anterior al formato que espera `POST /productos` + `POST /stock/movimientos`. */
export function mapearArticulo(fila: FilaCatalogo): ArticuloAImportar {
  const advertencias: string[] = [];

  const codigo = String(fila.codigo).trim();
  if (codigo === '') {
    throw new Error('Fila sin código: no se puede importar (el código es la clave de idempotencia).');
  }

  let nombre = fila.descripcion.trim();
  if (nombre === '') {
    throw new Error(`Artículo ${codigo} sin descripción.`);
  }
  if (nombre.length > LARGO_MAX_NOMBRE) {
    advertencias.push(`Nombre truncado a ${LARGO_MAX_NOMBRE} caracteres.`);
    nombre = nombre.slice(0, LARGO_MAX_NOMBRE);
  }

  const rubroLimpio = fila.rubro?.trim();
  const categoriaNombre = rubroLimpio && rubroLimpio !== '' ? rubroLimpio : CATEGORIA_DEFECTO;

  const tipoIva = mapearAlicuota(fila.porcentajeIva);

  if (fila.precioVenta === 0) {
    advertencias.push('Precio de venta en $0 — revisar antes de vender.');
  }
  if (fila.precioCosto === 0) {
    advertencias.push('Precio de costo en $0.');
  }

  let stockInicial: string | null = null;
  if (fila.stock > 0) {
    stockInicial = String(fila.stock);
  } else if (fila.stock < 0) {
    advertencias.push(`Stock negativo en el archivo original (${fila.stock}) — se importa en 0.`);
  }

  const activo = (fila.activo ?? 'S').trim().toUpperCase() !== 'N';

  return {
    codigo,
    nombre,
    precioVenta: fila.precioVenta.toFixed(2),
    precioCosto: fila.precioCosto.toFixed(2),
    tipoIva,
    categoriaNombre,
    activo,
    stockInicial,
    advertencias,
  };
}
