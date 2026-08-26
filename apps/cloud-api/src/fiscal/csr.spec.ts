import { describe, expect, it } from 'vitest';
import * as forge from 'node-forge';

import {
  construirSubject,
  ErrorCsr,
  generarCsr,
  leerCertificado,
  normalizarAlias,
} from './csr';

const DATOS = {
  cuit: '20-35678007-9',
  razonSocial: 'Rivarola Sergio Sebastian',
  alias: 'NexoSoft-Prueba',
};

describe('normalizarAlias', () => {
  it('saca acentos y espacios, que ARCA no acepta en el CN', () => {
    expect(normalizarAlias('Almacén La Esquina')).toBe('Almacen-La-Esquina');
  });

  it('no deja guiones al principio, al final ni repetidos', () => {
    expect(normalizarAlias('  ...hola...  ')).toBe('hola');
  });

  it('cae al alias por defecto si no queda nada usable', () => {
    expect(normalizarAlias('!!!')).toBe('nexosoft');
    expect(normalizarAlias('')).toBe('nexosoft');
  });
});

describe('construirSubject', () => {
  it('arma el formato exacto que exige ARCA', () => {
    expect(construirSubject(DATOS)).toBe(
      'C=AR, O=Rivarola Sergio Sebastian, CN=NexoSoft-Prueba, serialNumber=CUIT 20356780079',
    );
  });

  it('el CUIT va sin guiones y con la palabra CUIT adelante', () => {
    expect(construirSubject(DATOS)).toContain('serialNumber=CUIT 20356780079');
    expect(construirSubject(DATOS)).not.toContain('20-35678007-9');
  });
});

describe('generarCsr', () => {
  it('rechaza un CUIT con el dígito verificador mal, antes de generar nada', () => {
    expect(() => generarCsr({ ...DATOS, cuit: '20-35678007-1' })).toThrow(ErrorCsr);
  });

  it('rechaza si falta la razón social', () => {
    expect(() => generarCsr({ ...DATOS, razonSocial: '   ' })).toThrow(ErrorCsr);
  });

  it('devuelve un CSR en PEM y una clave privada aparte', () => {
    const r = generarCsr(DATOS);
    expect(r.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
    expect(r.clavePrivadaPem).toContain('BEGIN RSA PRIVATE KEY');
    expect(r.csrPem).not.toContain('PRIVATE KEY');
  });

  it('el CSR es PKCS#10 válido, RSA 2048 y con la firma correcta', () => {
    const r = generarCsr(DATOS);
    const csr = forge.pki.certificationRequestFromPem(r.csrPem);
    expect(csr.verify()).toBe(true);
    const publica = csr.publicKey as forge.pki.rsa.PublicKey;
    expect(publica.n.bitLength()).toBe(2048);
  });

  it('el subject del CSR tiene los cuatro campos que mira ARCA', () => {
    const csr = forge.pki.certificationRequestFromPem(generarCsr(DATOS).csrPem);
    const valor = (nombre: string) =>
      csr.subject.attributes.find((a) => a.shortName === nombre || a.name === nombre)?.value;
    expect(valor('C')).toBe('AR');
    expect(valor('O')).toBe('Rivarola Sergio Sebastian');
    expect(valor('CN')).toBe('NexoSoft-Prueba');
    expect(valor('serialNumber')).toBe('CUIT 20356780079');
  });

  it('cada pedido genera una clave distinta', () => {
    expect(generarCsr(DATOS).clavePrivadaPem).not.toBe(generarCsr(DATOS).clavePrivadaPem);
  });
});

/** Firma un certificado de mentira, como haría ARCA con nuestro CSR. */
function certificadoDeMentira(csrPem: string, claveFirmantePem?: string): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.rsa.PublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2028-01-01T00:00:00Z');
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ shortName: 'CN', value: 'AC ARCA de prueba' }]);
  const par = forge.pki.rsa.generateKeyPair(512);
  cert.sign(
    claveFirmantePem !== undefined ? forge.pki.privateKeyFromPem(claveFirmantePem) : par.privateKey,
    forge.md.sha256.create(),
  );
  return forge.pki.certificateToPem(cert);
}

describe('leerCertificado', () => {
  it('lee los datos del certificado que devolvería ARCA', () => {
    const generado = generarCsr(DATOS);
    const cert = certificadoDeMentira(generado.csrPem);

    const datos = leerCertificado(cert, generado.clavePrivadaPem);

    expect(datos.cuit).toBe('20356780079');
    expect(datos.subject).toContain('CN=NexoSoft-Prueba');
    expect(datos.emisor).toContain('AC ARCA de prueba');
    expect(datos.validoHasta.startsWith('2028-01-01')).toBe(true);
  });

  it('rechaza un certificado que NO corresponde a nuestra clave', () => {
    // El caso real: se sube el certificado de otro comercio, o el de un
    // pedido anterior que quedó dando vueltas en Descargas.
    const otro = generarCsr({ ...DATOS, alias: 'otro-comercio' });
    const nuestro = generarCsr(DATOS);
    const certDelOtro = certificadoDeMentira(otro.csrPem);

    expect(() => leerCertificado(certDelOtro, nuestro.clavePrivadaPem)).toThrow(
      /no corresponde a la clave de esta PC/,
    );
  });

  it('rechaza un archivo que no es un certificado', () => {
    const nuestro = generarCsr(DATOS);
    expect(() => leerCertificado('esto no es un certificado', nuestro.clavePrivadaPem)).toThrow(
      /no parece un certificado/,
    );
  });
});
