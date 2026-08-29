/**
 * Traduce una violación de foreign key a algo que se pueda leer y accionar.
 *
 * Cuando una venta llega desde una terminal cuyo catálogo (o terminal, o
 * cliente) quedó desfasado del servidor, Prisma tira:
 *
 *   Invalid `prisma.venta.create()` invocation:
 *   Foreign key constraint violated on the (not available)
 *
 * Ese texto viajaba tal cual hasta la pantalla "Ventas que no llegaron al
 * servidor". El sistema sabía exactamente qué referencia faltaba y no lo decía,
 * así que las ventas se acumulaban en la cola durante días sin que nadie
 * pudiera hacer nada. Es el mismo error que en su momento se atribuyó a "un
 * catálogo que se encimó" sin poder confirmarlo.
 *
 * Además, una referencia rota **no es reintentable**: reintentarla 5 veces sólo
 * demora el momento en que alguien se entera.
 */

/** Código de Prisma para "foreign key constraint failed". */
const FK_VIOLADA = 'P2003';

/**
 * A qué apunta cada foreign key de una venta, en castellano y con la salida.
 *
 * Se busca por subcadena porque Prisma informa el nombre de la constraint
 * (`ItemVenta_productoId_fkey`) y no el del campo, y el formato cambia entre
 * versiones y motores.
 */
const POR_CAMPO: ReadonlyArray<{ readonly clave: string; readonly mensaje: string }> = [
  {
    clave: 'productoId',
    mensaje:
      'Un producto de esta venta ya no existe en el servidor. Pasa cuando el catálogo del servidor se reemplazó y esta terminal quedó con el anterior: actualizá el catálogo en la terminal y volvé a intentar.',
  },
  {
    clave: 'terminalId',
    mensaje:
      'Esta terminal no está registrada en el servidor. Suele pasar si el servidor se reinstaló: volvé a elegir la caja en el POS.',
  },
  {
    clave: 'clienteId',
    mensaje: 'El cliente de esta venta ya no existe en el servidor.',
  },
  {
    clave: 'tarjetaConfigId',
    mensaje: 'La tarjeta con la que se cobró ya no está configurada en el servidor.',
  },
  {
    clave: 'usuarioId',
    mensaje:
      'El usuario que hizo esta venta ya no existe en el servidor. Cerrá sesión y volvé a entrar.',
  },
  {
    clave: 'sucursalId',
    mensaje: 'La sucursal de esta venta ya no existe en el servidor.',
  },
];

/** Lo que Prisma expone de un error conocido. Se lee por forma, no por clase. */
interface ErrorConCodigo {
  readonly code?: unknown;
  readonly meta?: { readonly field_name?: unknown } | null;
}

/**
 * Mensaje accionable si el error es una referencia rota; `null` si es otra cosa.
 */
export function mensajeDeReferenciaRota(error: unknown): string | null {
  const e = error as ErrorConCodigo | null;
  if (e === null || typeof e !== 'object' || e.code !== FK_VIOLADA) return null;

  const campo = typeof e.meta?.field_name === 'string' ? e.meta.field_name : '';
  const conocido = POR_CAMPO.find((c) => campo.includes(c.clave));
  if (conocido !== undefined) return conocido.mensaje;

  // Prisma no siempre sabe qué constraint falló (ahí manda "(not available)").
  // Aun así conviene decir de qué se trata: sin esto quedaba el texto crudo en
  // inglés, que no le sirve a nadie.
  return (
    'Esta venta apunta a datos que ya no existen en el servidor' +
    (campo === '' ? '' : ` (${campo})`) +
    '. Suele pasar cuando el servidor se reinstaló o se reemplazó el catálogo, y la terminal quedó con los datos anteriores.'
  );
}
