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
    neto: '1500.00',
    iva: '0.00',
    exento: '0.00',
    renglonesIva: [],
  };

  /** Los mismos importes, pero como Factura B (discrimina IVA). */
  const FACTURA_B = {
    ...DATOS,
    codigoComprobante: 6,
    neto: '1239.67',
    iva: '260.33',
    exento: '0.00',
    renglonesIva: [{ codigoArca: 5, base: '1239.67', importe: '260.33' }],
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

  it('una Factura B manda el detalle por alícuota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, FACTURA_B);
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<ImpNeto>1239.67</ImpNeto>');
    expect(body).toContain('<ImpIVA>260.33</ImpIVA>');
    expect(body).toContain('<Iva><AlicIva><Id>5</Id><BaseImp>1239.67</BaseImp><Importe>260.33</Importe></AlicIva></Iva>');
  });

  it('varias alícuotas van como renglones separados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, {
      ...FACTURA_B,
      renglonesIva: [
        { codigoArca: 4, base: '100.00', importe: '10.50' },
        { codigoArca: 5, base: '200.00', importe: '42.00' },
      ],
    });
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect((body.match(/<AlicIva>/g) ?? []).length).toBe(2);
    expect(body).toContain('<Id>4</Id>');
    expect(body).toContain('<Id>5</Id>');
  });

  it('las operaciones exentas van en ImpOpEx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, { ...FACTURA_B, exento: '500.00' });
    expect((fetchMock.mock.calls[0]![1] as { body: string }).body).toContain(
      '<ImpOpEx>500.00</ImpOpEx>',
    );
  });

  it('una Factura A sin CUIT del cliente se corta antes de llamar a ARCA', async () => {
    // ARCA la rechazaria igual; mejor decir por que.
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await expect(
      cliente(fetchMock as never).solicitarCae(TICKET, { ...FACTURA_B, codigoComprobante: 1 }),
    ).rejects.toBeInstanceOf(ErrorWsfeNoSoportado);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('una Factura A con CUIT del cliente sí sale', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, {
      ...FACTURA_B,
      codigoComprobante: 1,
      tipoDocReceptor: 80,
      nroDocReceptor: '30712345671',
    });
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<DocTipo>80</DocTipo>');
    expect(body).toContain('<DocNro>30712345671</DocNro>');
  });

  it('sin receptor asume consumidor final', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, DATOS);
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<DocTipo>99</DocTipo>');
    expect(body).toContain('<DocNro>0</DocNro>');
    // La RG 5616/2024 la volvio obligatoria: sin ella el comprobante rebota.
    expect(body).toContain('<CondicionIVAReceptorId>5</CondicionIVAReceptorId>');
  });

  it('manda la condicion del receptor que le pasan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(OK));
    await cliente(fetchMock as never).solicitarCae(TICKET, {
      ...FACTURA_B,
      codigoComprobante: 1,
      tipoDocReceptor: 80,
      nroDocReceptor: '30712345671',
      condicionIvaReceptor: 1,
    });
    const body = (fetchMock.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<CondicionIVAReceptorId>1</CondicionIVAReceptorId>');
    // El XSD de WSFEv1 es una secuencia: va despues de MonCotiz y antes de Iva.
    expect(body.indexOf('<CondicionIVAReceptorId>')).toBeGreaterThan(body.indexOf('<MonCotiz>'));
    expect(body.indexOf('<CondicionIVAReceptorId>')).toBeLessThan(body.indexOf('<Iva>'));
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
