import { describe, expect, it } from 'vitest';

import { mensajeDeReferenciaRota } from './referencia-rota';

/** Un error de Prisma como llega en la práctica. */
function errorPrisma(fieldName: string | undefined, code = 'P2003') {
  return Object.assign(
    new Error('Invalid `prisma.venta.create()` invocation: Foreign key constraint violated'),
    { code, meta: fieldName === undefined ? null : { field_name: fieldName } },
  );
}

describe('mensajeDeReferenciaRota', () => {
  it('nombra el catálogo cuando el producto ya no existe', () => {
    // El caso real: se reinstaló el servidor, quedó con otro catálogo, y la
    // terminal siguió vendiendo los productos viejos.
    const m = mensajeDeReferenciaRota(errorPrisma('ItemVenta_productoId_fkey (index)'));
    expect(m).toContain('producto');
    expect(m).toContain('actualizá el catálogo');
  });

  it('nombra la terminal', () => {
    const m = mensajeDeReferenciaRota(errorPrisma('Venta_terminalId_fkey'));
    expect(m).toContain('terminal');
    expect(m).toContain('elegir la caja');
  });

  it('cubre el resto de las referencias de una venta', () => {
    expect(mensajeDeReferenciaRota(errorPrisma('Venta_clienteId_fkey'))).toContain('cliente');
    expect(mensajeDeReferenciaRota(errorPrisma('Pago_tarjetaConfigId_fkey'))).toContain('tarjeta');
    expect(mensajeDeReferenciaRota(errorPrisma('Venta_usuarioId_fkey'))).toContain('usuario');
    expect(mensajeDeReferenciaRota(errorPrisma('Venta_sucursalId_fkey'))).toContain('sucursal');
  });

  it('dice algo útil aunque Prisma no sepa qué constraint fallo', () => {
    // Es el caso que vimos en la PC del socio: Prisma manda "(not available)".
    const m = mensajeDeReferenciaRota(errorPrisma(undefined));
    expect(m).toContain('datos que ya no existen en el servidor');
    expect(m).not.toContain('Foreign key');
  });

  it('no se mete con errores que no son de referencia', () => {
    expect(mensajeDeReferenciaRota(errorPrisma('algo', 'P2002'))).toBeNull();
    expect(mensajeDeReferenciaRota(new Error('cualquier otra cosa'))).toBeNull();
    expect(mensajeDeReferenciaRota(null)).toBeNull();
    expect(mensajeDeReferenciaRota(undefined)).toBeNull();
  });
});
