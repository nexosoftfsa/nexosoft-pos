import { describe, expect, it, vi } from 'vitest';

import {
  aFechaArca,
  ClienteWsfev1,
  ErrorWsfe,
  ErrorWsfeNoSoportado,
  esComprobanteC,
  leerErrores,
  leerObservaciones,
  leerRespuestaCae,
} from './wsfev1';

const TICKET = { token: 'TOK', sign: 'SIG', expiracion: new Date(Date.now() + 3600_000) };

function respuesta(xml: string): Response {
  return { ok: true, status: 200, text: async () => xml } as Response;
}

function cliente(fetchImpl: typeof fetch) {
  return new ClienteWsfev1({ entorno: 'homologacion', cuit: '20356780079', fetchImpl });
}

describe('aFechaArca', () => {
  it('usa yyyymmdd, que es lo que pide WSFEv1', () => {
    expect(aFechaArca(new Date(2026, 7, 27))).toBe('20260827');
    expect(aFechaArca(new Date(2026, 0, 5))).toBe('20260105');
  });
});

describe('esComprobanteC', () => {
  it('reconoce factura, nota de débito y nota de crédito C', () => {
    expect(esComprobanteC(11)).toBe(true);
    expect(esComprobanteC(12)).toBe(true);
    expect(esComprobanteC(13)).toBe(true);
  });

  it('A y B todavía no', () => {
    expect(esComprobanteC(1)).toBe(false);
    expect(esComprobanteC(6)).toBe(false);
  });
});

describe('ultimoAutorizado', () => {
  it('pregunta por punto de venta y tipo, y devuelve el número', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuesta('<FECompUltimoAutorizadoResult><CbteNro>41</CbteNro></FECompUltimoAutorizadoResult>'));

    const n = await cliente(fetchMock as never).ultimoAutorizado(TICKET, 1, 11);

    expect(n).toBe(41);
    const [url, op] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('wswhomo.afip.gov.ar');
    const headers = (op as { headers: Record<string, string> }).headers;
    expect(headers['SOAPAction']).toContain('FECompUltimoAutorizado');
    const body = (op as { body: string }).body;
    expect(body).toContain('<PtoVta>1</PtoVta>');
    expect(body).toContain('<CbteTipo>11</CbteTipo>');
    expect(body).toContain('<Token>TOK</Token>');
    expect(body).toContain('<Cuit>20356780079</Cuit>');
  });

  it('un error de ARCA no se toma como número', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuesta('<Errors><Err><Code>600</Code><Msg>Token invalido</Msg></Err></Errors>'),
    );
    await expect(cliente(fetchMock as never).ultimoAutorizado(TICKET, 1, 11)).rejects.toThrow(
      /Token invalido/,
    );
  });
});

describe('solicitarCae', () => {
  const OK =
    '<FECAESolicitarResult><FeDetResp><FECAEDetResponse>' +
    '<CbteDesde>42</CbteDesde><Resultado>A</Resultado>' +
    '<CAE>75123456789012</CAE><CAEFchVto>20260906</CAEFchVto>' +
    '</FECAEDetResponse></FeDetResp></FECAESolicitarResult>';

  const DATOS = {
    puntoDeVenta: 1,
    codigoComprobante: 11,
    numero: 42,
    total: '1500.00',
    fecha: new Date(2026, 7, 27),
  };

  it('devuelve el CAE y su vencimiento', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));

    const r = await cliente(fetchMock as never).solicitarCae(TICKET, DATOS);

    expect(r.cae).toBe('75123456789012');
    expect(r.caeFechaVto.getFullYear()).toBe(2026);
    expect(r.caeFechaVto.getMonth()).toBe(8); // septiembre
    expect(r.numero).toBe(42);
  });

  it('manda el número que proponemos: ARCA valida la correlatividad', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, DATOS);
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<CbteDesde>42</CbteDesde>');
    expect(body).toContain('<CbteHasta>42</CbteHasta>');
    expect(body).toContain('<CbteFch>20260827</CbteFch>');
  });

  it('en un comprobante C no manda IVA discriminado', async () => {
    // Mandar un desglose inventado seria declarar mal ante ARCA.
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, DATOS);
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<ImpTotal>1500.00</ImpTotal>');
    expect(body).toContain('<ImpNeto>1500.00</ImpNeto>');
    expect(body).toContain('<ImpIVA>0</ImpIVA>');
    expect(body).not.toContain('<Iva>');
  });

  it('se planta con Factura A o B en vez de inventar el desglose', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await expect(
      cliente(fetchMock as never).solicitarCae(TICKET, { ...DATOS, codigoComprobante: 6 }),
    ).rejects.toBeInstanceOf(ErrorWsfeNoSoportado);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('leerRespuestaCae', () => {
  it('un rechazo con Errors no es transitorio', () => {
    const xml = '<Errors><Err><Code>10016</Code><Msg>Numero de comprobante invalido</Msg></Err></Errors>';
    const e = (() => {
      try {
        leerRespuestaCae(xml);
        return null;
      } catch (err) {
        return err as ErrorWsfe;
      }
    })();
    expect(e).toBeInstanceOf(ErrorWsfe);
    expect(e?.transitorio).toBe(false);
    expect(e?.codigo).toBe('10016');
  });

  it('Resultado R es rechazo, con las observaciones adentro', () => {
    const xml =
      '<Resultado>R</Resultado><Observaciones><Obs><Code>10013</Code><Msg>Fecha fuera de rango</Msg></Obs></Observaciones>';
    expect(() => leerRespuestaCae(xml)).toThrow(/Fecha fuera de rango/);
  });

  it('aprobado con observaciones devuelve el CAE y las conserva', () => {
    const xml =
      '<Resultado>A</Resultado><CbteDesde>7</CbteDesde><CAE>111</CAE><CAEFchVto>20260906</CAEFchVto>' +
      '<Observaciones><Obs><Code>10071</Code><Msg>Dato informado no coincide</Msg></Obs></Observaciones>';
    const r = leerRespuestaCae(xml);
    expect(r.cae).toBe('111');
    expect(r.observaciones[0]).toContain('10071');
  });

  it('sin CAE y sin error explicito, se marca transitorio', () => {
    expect(() => leerRespuestaCae('<Resultado>A</Resultado>')).toThrow(ErrorWsfe);
  });
});

describe('leerErrores / leerObservaciones', () => {
  it('lee varios errores', () => {
    const xml =
      '<Errors><Err><Code>1</Code><Msg>uno</Msg></Err><Err><Code>2</Code><Msg>dos</Msg></Err></Errors>';
    expect(leerErrores(xml)).toHaveLength(2);
    expect(leerErrores(xml)[1]?.mensaje).toBe('dos');
  });

  it('sin bloque devuelve vacío', () => {
    expect(leerErrores('<ok/>')).toEqual([]);
    expect(leerObservaciones('<ok/>')).toEqual([]);
  });
});
