import { describe, expect, it, vi } from 'vitest';

import { ErrorWsfe, type DatosComprobante, type ResultadoAutorizacion } from '../../fiscal/arca/wsfev1';
import { solicitarConRecuperacion, type ClienteParaRecuperar } from './solicitar-con-recuperacion';

const TICKET = { token: 'TOK', sign: 'SIG', expiracion: new Date(Date.now() + 3600_000) };

const DATOS: DatosComprobante = {
  puntoDeVenta: 4,
  codigoComprobante: 6,
  numero: 42,
  total: '1000.00',
  fecha: new Date(2026, 7, 28),
  neto: '826.45',
  iva: '173.55',
  exento: '0.00',
  renglonesIva: [{ codigoArca: 5, base: '826.45', importe: '173.55' }],
};

const AUTORIZADO: ResultadoAutorizacion = {
  cae: '75200312345678',
  caeFechaVto: new Date(2026, 8, 7),
  numero: 42,
  observaciones: [],
};

function cliente(over: Partial<ClienteParaRecuperar> = {}): ClienteParaRecuperar {
  return {
    solicitarCae: vi.fn().mockResolvedValue(AUTORIZADO),
    consultarComprobante: vi.fn().mockResolvedValue(null),
    ...over,
  };
}

describe('solicitarConRecuperacion', () => {
  it('en el camino feliz no consulta nada', async () => {
    const c = cliente();

    await expect(solicitarConRecuperacion(c, TICKET, DATOS)).resolves.toEqual(AUTORIZADO);
    expect(c.consultarComprobante).not.toHaveBeenCalled();
  });

  it('si la respuesta se perdió pero ARCA ya lo autorizó, recupera el CAE', async () => {
    // El caso que deja un comprobante fantasma: ARCA emitió, la respuesta no
    // volvió. Sin esto, el reintento emitiría OTRO número y el primero quedaría
    // vivo en ARCA sin registro acá.
    const c = cliente({
      solicitarCae: vi.fn().mockRejectedValue(new ErrorWsfe('ARCA no respondió en 20 segundos.', true)),
      consultarComprobante: vi.fn().mockResolvedValue(AUTORIZADO),
    });

    await expect(solicitarConRecuperacion(c, TICKET, DATOS)).resolves.toEqual(AUTORIZADO);
    expect(c.consultarComprobante).toHaveBeenCalledWith(TICKET, 4, 6, 42);
  });

  it('si ARCA tampoco lo tiene, el error transitorio sigue siendo el original', async () => {
    const original = new ErrorWsfe('ARCA no respondió en 20 segundos.', true);
    const c = cliente({
      solicitarCae: vi.fn().mockRejectedValue(original),
      consultarComprobante: vi.fn().mockResolvedValue(null),
    });

    await expect(solicitarConRecuperacion(c, TICKET, DATOS)).rejects.toBe(original);
  });

  it('un RECHAZO no se consulta: ARCA contestó y dijo que no', async () => {
    const rechazo = new ErrorWsfe('Numeración no correlativa', false, '10016');
    const c = cliente({ solicitarCae: vi.fn().mockRejectedValue(rechazo) });

    await expect(solicitarConRecuperacion(c, TICKET, DATOS)).rejects.toBe(rechazo);
    expect(c.consultarComprobante).not.toHaveBeenCalled();
  });

  it('si la consulta también falla, queda el error original y no uno peor', async () => {
    // La venta tiene que quedar PENDIENTE igual que si no hubiéramos
    // preguntado; el error de la consulta no aporta nada al comercio.
    const original = new ErrorWsfe('No se pudo contactar a ARCA', true);
    const c = cliente({
      solicitarCae: vi.fn().mockRejectedValue(original),
      consultarComprobante: vi.fn().mockRejectedValue(new Error('tampoco anduvo')),
    });

    await expect(solicitarConRecuperacion(c, TICKET, DATOS)).rejects.toBe(original);
  });

  it('deja registro de que recuperó un CAE en vez de emitir otro', async () => {
    const avisos: string[] = [];
    const c = cliente({
      solicitarCae: vi.fn().mockRejectedValue(new ErrorWsfe('timeout', true)),
      consultarComprobante: vi.fn().mockResolvedValue(AUTORIZADO),
    });

    await solicitarConRecuperacion(c, TICKET, DATOS, (m) => avisos.push(m));

    expect(avisos.join(' ')).toContain('6-4-42');
    expect(avisos.join(' ')).toContain('ya estaba autorizado');
  });

  it('un error que no es de WSFE se propaga tal cual', async () => {
    const bug = new Error('bug de programación');
    const c = cliente({ solicitarCae: vi.fn().mockRejectedValue(bug) });

    await expect(solicitarConRecuperacion(c, TICKET, DATOS)).rejects.toBe(bug);
    expect(c.consultarComprobante).not.toHaveBeenCalled();
  });
});
