import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';

const USUARIO = { id: 'u1', email: 'cajero@nexo.com', sucursalId: 's1' };

const payloadVentaValido = {
  medioPago: 'EFECTIVO',
  items: [{ productoId: 'p1', cantidad: '2', precioUnitario: '100' }],
};

function operacion(operacionId: string, payload: Record<string, unknown>, tipo = 'venta', terminalId?: string) {
  return { operacionId, tipo, payload, ...(terminalId ? { terminalId } : {}) };
}

const VTO = new Date('2026-09-10T00:00:00.000Z');

/** Lo que devuelve `registrar` de la venta ya autorizada por ARCA. */
const COMPROBANTE = {
  numeroComprobante: 7,
  tipoComprobante: 'FacturaC',
  cae: '75123456789012',
  caeFechaVto: VTO,
  estadoFiscal: 'AUTORIZADA',
};

describe('SyncService', () => {
  let ventas: { registrar: ReturnType<typeof vi.fn> };
  let service: SyncService;

  beforeEach(() => {
    ventas = { registrar: vi.fn().mockResolvedValue({ id: 'v1', ...COMPROBANTE }) };
    service = new SyncService(ventas as never);
  });

  it('aplica una venta válida y devuelve ok con idRemoto', async () => {
    const res = await service.procesar(USUARIO, {
      operaciones: [operacion('op-1', payloadVentaValido)],
    });

    // El comprobante resuelto vuelve con el resultado: el POS lo necesita para
    // imprimir el ticket con el CAE y el numero que asigno ARCA.
    expect(res['op-1']).toEqual({
      ok: true,
      idRemoto: 'v1',
      comprobante: {
        numeroComprobante: 7,
        tipoComprobante: 'FacturaC',
        cae: '75123456789012',
        caeFechaVto: VTO.toISOString(),
        estadoFiscal: 'AUTORIZADA',
      },
    });
    expect(ventas.registrar).toHaveBeenCalledOnce();
  });

  it('usa el operacionId de la operación (no el del payload)', async () => {
    await service.procesar(USUARIO, {
      operaciones: [operacion('op-real', { ...payloadVentaValido, operacionId: 'PAYLOAD-VIEJO' })],
    });

    const dtoRecibido = ventas.registrar.mock.calls[0]![1];
    expect(dtoRecibido.operacionId).toBe('op-real');
  });

  it('pasa el terminalId de la operación a la venta', async () => {
    await service.procesar(USUARIO, {
      operaciones: [operacion('op-1', payloadVentaValido, 'venta', 'term-7')],
    });

    const dtoRecibido = ventas.registrar.mock.calls[0]![1];
    expect(dtoRecibido.terminalId).toBe('term-7');
  });

  it('rechaza tipo no soportado (no reintentable)', async () => {
    const res = await service.procesar(USUARIO, {
      operaciones: [operacion('op-1', {}, 'alta_producto')],
    });

    expect(res['op-1']).toEqual({
      ok: false,
      error: expect.stringContaining('no soportado'),
      reintentable: false,
    });
    expect(ventas.registrar).not.toHaveBeenCalled();
  });

  it('rechaza payload de venta inválido (no reintentable)', async () => {
    const res = await service.procesar(USUARIO, {
      operaciones: [operacion('op-1', { medioPago: 'EFECTIVO' })], // sin items
    });

    expect(res['op-1']).toMatchObject({ ok: false, reintentable: false });
    expect(ventas.registrar).not.toHaveBeenCalled();
  });

  it('marca NO reintentable un error de negocio (4xx)', async () => {
    ventas.registrar.mockRejectedValue(new BadRequestException('stock insuficiente'));

    const res = await service.procesar(USUARIO, {
      operaciones: [operacion('op-1', payloadVentaValido)],
    });

    expect(res['op-1']).toMatchObject({ ok: false, reintentable: false });
  });

  it('marca reintentable un error genérico (DB/5xx)', async () => {
    ventas.registrar.mockRejectedValue(new Error('connection reset'));

    const res = await service.procesar(USUARIO, {
      operaciones: [operacion('op-1', payloadVentaValido)],
    });

    expect(res['op-1']).toMatchObject({ ok: false, reintentable: true });
  });

  it('procesa un lote mixto sin que una falla corte el resto', async () => {
    ventas.registrar
      .mockResolvedValueOnce({ id: 'v1', ...COMPROBANTE })
      .mockRejectedValueOnce(new Error('falló esta'));

    const res = await service.procesar(USUARIO, {
      operaciones: [
        operacion('op-1', payloadVentaValido),
        operacion('op-2', payloadVentaValido),
        operacion('op-3', {}, 'tipo_raro'),
      ],
    });

    expect(res['op-1']).toMatchObject({ ok: true });
    expect(res['op-2']).toMatchObject({ ok: false, reintentable: true });
    expect(res['op-3']).toMatchObject({ ok: false, reintentable: false });
  });
});
