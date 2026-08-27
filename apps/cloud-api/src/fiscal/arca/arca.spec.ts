import { describe, expect, it } from 'vitest';
import * as forge from 'node-forge';

import { generarCsr } from '../csr';
import { firmarTraCms, ErrorFirmaCms } from './firma-cms';
import { aIsoConOffset, construirTra, leerFaultSoap, leerTicketAcceso } from './tra';

const DATOS = {
  cuit: '20-35678007-9',
  razonSocial: 'Rivarola Sergio Sebastian',
  alias: 'NexoSoft-Prueba',
};

/** Un certificado firmado sobre un CSR, como el que devuelve ARCA. */
function certificadoPara(csrPem: string): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.rsa.PublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 730 * 86400000);
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ shortName: 'CN', value: 'AC ARCA de prueba' }]);
  cert.sign(forge.pki.rsa.generateKeyPair(512).privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

describe('aIsoConOffset', () => {
  it('escribe la hora local con offset, no en UTC', () => {
    // ARCA rechaza el TRA si las fechas vienen en UTC con "Z".
    const s = aIsoConOffset(new Date(2026, 7, 27, 14, 5, 30));
    expect(s).toMatch(/^2026-08-27T14:05:30[+-]\d{2}:\d{2}$/);
    expect(s).not.toContain('Z');
  });
});

describe('construirTra', () => {
  const AHORA = new Date(2026, 7, 27, 14, 0, 0);

  it('pide acceso al servicio que se le indica', () => {
    expect(construirTra({ servicio: 'wsfe', ahora: AHORA })).toContain('<service>wsfe</service>');
  });

  it('generationTime queda ANTES de ahora, por si el reloj está adelantado', () => {
    const tra = construirTra({ servicio: 'wsfe', ahora: AHORA });
    const gen = /<generationTime>([^<]+)<\/generationTime>/.exec(tra)?.[1] ?? '';
    expect(new Date(gen).getTime()).toBeLessThan(AHORA.getTime());
  });

  it('la ventana de vigencia es corta: ARCA rechaza las largas', () => {
    const tra = construirTra({ servicio: 'wsfe', ahora: AHORA });
    const gen = new Date(/<generationTime>([^<]+)</.exec(tra)?.[1] ?? '');
    const exp = new Date(/<expirationTime>([^<]+)</.exec(tra)?.[1] ?? '');
    const minutos = (exp.getTime() - gen.getTime()) / 60000;
    expect(minutos).toBeGreaterThan(0);
    expect(minutos).toBeLessThanOrEqual(30);
  });

  it('el uniqueId cambia entre pedidos: ARCA rechaza uno repetido', () => {
    const a = construirTra({ servicio: 'wsfe', ahora: new Date(2026, 7, 27, 14, 0, 0) });
    const b = construirTra({ servicio: 'wsfe', ahora: new Date(2026, 7, 27, 14, 0, 5) });
    const id = (t: string) => /<uniqueId>(\d+)</.exec(t)?.[1];
    expect(id(a)).not.toBe(id(b));
  });

  it('el uniqueId entra en un entero de 32 bits', () => {
    const tra = construirTra({ servicio: 'wsfe', ahora: new Date(2260, 0, 1) });
    expect(Number(/<uniqueId>(\d+)</.exec(tra)?.[1])).toBeLessThanOrEqual(2_147_483_647);
  });
});

describe('firmarTraCms', () => {
  it('produce un CMS válido, en base64, con el TRA adentro', () => {
    const { csrPem, clavePrivadaPem } = generarCsr(DATOS);
    const cert = certificadoPara(csrPem);
    const tra = construirTra({ servicio: 'wsfe' });

    const cms = firmarTraCms(tra, cert, clavePrivadaPem);

    expect(cms).toMatch(/^[A-Za-z0-9+/=]+$/); // base64 puro

    // Se vuelve a parsear como PKCS#7: tiene que ser signedData, llevar el
    // certificado adentro (ARCA lo necesita para verificar) y contener el TRA
    // tal como lo firmamos.
    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.decode64(cms)),
    ) as unknown as {
      type: string;
      certificates: unknown[];
      rawCapture: { content: { value: { value: string }[] } };
    };
    expect(p7.type).toBe(forge.pki.oids.signedData);
    expect(p7.certificates).toHaveLength(1);
    expect(forge.util.decodeUtf8(p7.rawCapture.content.value[0]!.value)).toContain(
      '<service>wsfe</service>',
    );
  });

  it('se planta si la clave no es la del certificado', () => {
    // Firmar con la clave equivocada da un CMS que ARCA rechaza con un
    // mensaje que no explica nada. Mejor cortar acá.
    const uno = generarCsr(DATOS);
    const otro = generarCsr({ ...DATOS, alias: 'otro' });
    const certDeUno = certificadoPara(uno.csrPem);

    expect(() => firmarTraCms('<x/>', certDeUno, otro.clavePrivadaPem)).toThrow(ErrorFirmaCms);
  });

  it('avisa claro si el certificado está corrupto', () => {
    const { clavePrivadaPem } = generarCsr(DATOS);
    expect(() => firmarTraCms('<x/>', 'no soy un certificado', clavePrivadaPem)).toThrow(
      /no se puede leer/,
    );
  });
});

describe('leerTicketAcceso', () => {
  const respuestaOk = `<?xml version="1.0"?><soap:Envelope><soap:Body><loginCmsResponse><loginCmsReturn>
    &lt;loginTicketResponse&gt;&lt;header&gt;&lt;expirationTime&gt;2026-08-28T02:00:00-03:00&lt;/expirationTime&gt;&lt;/header&gt;
    &lt;credentials&gt;&lt;token&gt;TOKEN-ABC&lt;/token&gt;&lt;sign&gt;FIRMA-XYZ&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;
  </loginCmsReturn></loginCmsResponse></soap:Body></soap:Envelope>`;

  it('saca el token y la firma de adentro del SOAP', () => {
    const t = leerTicketAcceso(respuestaOk);
    expect(t.token).toBe('TOKEN-ABC');
    expect(t.sign).toBe('FIRMA-XYZ');
  });

  it('lee la expiración que manda ARCA', () => {
    expect(leerTicketAcceso(respuestaOk).expiracion.getFullYear()).toBe(2026);
  });

  it('sin expiración usable, asume una corta en vez de una larga', () => {
    // Usar un ticket vencido es rechazo seguro; pedir uno de más es barato.
    const sinExp = respuestaOk.replace(/&lt;expirationTime&gt;[^&]*&lt;\/expirationTime&gt;/, '');
    const t = leerTicketAcceso(sinExp);
    expect(t.expiracion.getTime()).toBeGreaterThan(Date.now());
    expect(t.expiracion.getTime()).toBeLessThan(Date.now() + 3 * 60 * 60_000);
  });

  it('si no hay ticket, falla con la respuesta a la vista', () => {
    expect(() => leerTicketAcceso('<soap:Envelope><soap:Body/></soap:Envelope>')).toThrow(
      /no devolvió un ticket/,
    );
  });
});

describe('leerFaultSoap', () => {
  it('devuelve el motivo cuando ARCA rechaza', () => {
    const fault =
      '<soap:Fault><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soap:Fault>';
    expect(leerFaultSoap(fault)).toContain('ya posee un TA valido');
  });

  it('devuelve null cuando no hubo error', () => {
    expect(leerFaultSoap('<soap:Body><ok/></soap:Body>')).toBeNull();
  });
});
