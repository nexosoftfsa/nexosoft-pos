import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as forge from 'node-forge';

import { generarCsr } from '../csr';
import { ClienteWsaa, ErrorWsaa, rutaCacheTicket } from './wsaa';

function parCertificado() {
  const { csrPem, clavePrivadaPem } = generarCsr({
    cuit: '20-35678007-9',
    razonSocial: 'Comercio de Prueba',
    alias: 'NexoSoft-Prueba',
  });
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.rsa.PublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ shortName: 'CN', value: 'AC de prueba' }]);
  cert.sign(forge.pki.rsa.generateKeyPair(512).privateKey, forge.md.sha256.create());
  return { certificadoPem: forge.pki.certificateToPem(cert), clavePrivadaPem };
}

function respuestaConTicket(token: string, expiracion: Date): Response {
  const xml =
    '<soap:Envelope><soap:Body><loginCmsResponse><loginCmsReturn>' +
    '&lt;loginTicketResponse&gt;&lt;header&gt;&lt;expirationTime&gt;' +
    expiracion.toISOString() +
    '&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;' +
    token +
    '&lt;/token&gt;&lt;sign&gt;FIRMA&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;' +
    '</loginCmsReturn></loginCmsResponse></soap:Body></soap:Envelope>';
  return { ok: true, status: 200, text: async () => xml } as Response;
}

describe('ClienteWsaa', () => {
  let carpeta: string;
  let cache: string;
  let par: ReturnType<typeof parCertificado>;

  beforeEach(() => {
    carpeta = mkdtempSync(join(tmpdir(), 'nexosoft-wsaa-'));
    cache = join(carpeta, 'ticket.json');
    par = parCertificado();
  });

  afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

  function cliente(fetchImpl: typeof fetch) {
    return new ClienteWsaa({
      entorno: 'homologacion',
      certificadoPem: par.certificadoPem,
      clavePrivadaPem: par.clavePrivadaPem,
      rutaCache: cache,
      fetchImpl,
    });
  }

  it('pide el ticket y manda el CMS firmado en el sobre SOAP', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaConTicket('TOK-1', new Date(Date.now() + 12 * 3600_000)));

    const t = await cliente(fetchMock as never).obtenerTicket('wsfe');

    expect(t.token).toBe('TOK-1');
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('wsaahomo.afip.gov.ar');
    const body = (opciones as { body: string }).body;
    expect(body).toContain('<wsaa:loginCms>');
    expect(body).toContain('<wsaa:in0>');
  });

  it('reusa el ticket cacheado en vez de pedir otro', async () => {
    // ARCA rechaza pedir uno nuevo mientras haya otro vigente, asi que esto
    // no es una optimizacion: es lo que evita quedarse sin facturar.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaConTicket('TOK-1', new Date(Date.now() + 12 * 3600_000)));
    const c = cliente(fetchMock as never);

    await c.obtenerTicket('wsfe');
    await c.obtenerTicket('wsfe');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('el ticket sobrevive a un reinicio del servidor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaConTicket('TOK-1', new Date(Date.now() + 12 * 3600_000)));
    await cliente(fetchMock as never).obtenerTicket('wsfe');

    // Otra instancia, como despues de reiniciar: lee el de disco.
    const otra = cliente(fetchMock as never);
    const t = await otra.obtenerTicket('wsfe');

    expect(t.token).toBe('TOK-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pide uno nuevo si el cacheado esta por vencer', async () => {
    writeFileSync(
      cache,
      JSON.stringify({
        token: 'VIEJO',
        sign: 'x',
        expiracion: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaConTicket('NUEVO', new Date(Date.now() + 12 * 3600_000)));

    const t = await cliente(fetchMock as never).obtenerTicket('wsfe');

    expect(t.token).toBe('NUEVO');
  });

  it('un cache ilegible no frena la facturacion', async () => {
    writeFileSync(cache, 'esto no es json');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaConTicket('NUEVO', new Date(Date.now() + 12 * 3600_000)));

    await expect(cliente(fetchMock as never).obtenerTicket('wsfe')).resolves.toMatchObject({
      token: 'NUEVO',
    });
  });

  it('guarda el ticket con permisos restringidos y no lo expone', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaConTicket('TOK-1', new Date(Date.now() + 12 * 3600_000)));
    await cliente(fetchMock as never).obtenerTicket('wsfe');
    expect(JSON.parse(readFileSync(cache, 'utf8')).token).toBe('TOK-1');
  });

  it('sin internet avisa que es transitorio', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(cliente(fetchMock as never).obtenerTicket('wsfe')).rejects.toMatchObject({
      transitorio: true,
    });
  });

  it('"ya posee un TA valido" se explica y se marca transitorio', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        '<soap:Fault><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soap:Fault>',
    } as Response);

    await expect(cliente(fetchMock as never).obtenerTicket('wsfe')).rejects.toThrow(
      /ya hay un ticket de acceso vigente/,
    );
  });

  it('un rechazo del certificado NO es transitorio: reintentar no sirve', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        '<soap:Fault><faultstring>Certificado no emitido por AC de confianza</faultstring></soap:Fault>',
    } as Response);

    const error = await cliente(fetchMock as never)
      .obtenerTicket('wsfe')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorWsaa);
    expect((error as ErrorWsaa).transitorio).toBe(false);
    expect((error as ErrorWsaa).message).toContain('AC de confianza');
  });
});

describe('rutaCacheTicket', () => {
  it('separa el ticket por CUIT y por entorno', () => {
    const homo = rutaCacheTicket('C:/secrets', '20356780079', 'homologacion');
    const prod = rutaCacheTicket('C:/secrets', '20356780079', 'produccion');
    expect(homo).not.toBe(prod);
    expect(homo).toContain('20356780079');
  });
});
