import { createPublicKey, generateKeyPairSync, verify as verificarFirma } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as forge from 'node-forge';

import { firmarTraCms } from './firma-cms';
import { construirTra } from './tra';

/**
 * La firma del TRA la valida ARCA con SU stack, no con node-forge.
 *
 * Un CMS que node-forge sabe volver a leer no prueba gran cosa: si la firma
 * cubriera los bytes equivocados, la misma librería que la armó la daría por
 * buena. Acá se verifica con `node:crypto` —otra implementación— que la firma
 * sea RSA/SHA-256 sobre el DER de los atributos autenticados, que es lo que
 * dice el estándar y lo que ARCA comprueba.
 *
 * Si esto se rompe, WSAA contesta un error genérico y no hay forma de
 * facturar: es el eslabón donde un fallo cuesta más caro y se ve menos.
 */
function certificadoAutofirmado() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clavePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(
    publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 3_600_000);
  const sujeto = [
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: 'NexoSoft Prueba' },
    { name: 'commonName', value: 'prueba-cms' },
  ];
  cert.setSubject(sujeto);
  cert.setIssuer(sujeto);
  cert.sign(forge.pki.privateKeyFromPem(clavePem), forge.md.sha256.create());

  return { certificadoPem: forge.pki.certificateToPem(cert), clavePem, publicKey };
}

/** Lo que hay que verificar: sobre qué bytes se firmó, y con qué firma. */
function firmaDelCms(base64: string): { bytesFirmados: Buffer; firma: Buffer } {
  const p7 = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(forge.util.decode64(base64))),
  ) as unknown as {
    rawCapture: { authenticatedAttributes: forge.asn1.Asn1[]; signature: string };
  };

  // Lo firmado NO son los atributos tal como viajan (con etiqueta implícita
  // [0]), sino los mismos atributos reempaquetados como SET. Es el punto donde
  // una implementación descuidada firma los bytes equivocados y ARCA rechaza
  // sin decir por qué.
  const set = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    p7.rawCapture.authenticatedAttributes,
  );

  return {
    bytesFirmados: Buffer.from(forge.asn1.toDer(set).getBytes(), 'binary'),
    firma: Buffer.from(p7.rawCapture.signature, 'binary'),
  };
}

describe('firmarTraCms (interoperabilidad)', () => {
  it('la firma la valida node:crypto, no sólo node-forge', () => {
    const { certificadoPem, clavePem, publicKey } = certificadoAutofirmado();

    const { bytesFirmados, firma } = firmaDelCms(
      firmarTraCms(construirTra({ servicio: 'wsfe' }), certificadoPem, clavePem),
    );

    expect(firma.length).toBeGreaterThan(0);
    expect(verificarFirma('sha256', bytesFirmados, publicKey, firma)).toBe(true);
  });

  it('el TRA viaja ADENTRO del CMS: ARCA lo necesita así', () => {
    const { certificadoPem, clavePem } = certificadoAutofirmado();

    const der = forge.util.decode64(
      firmarTraCms(construirTra({ servicio: 'wsfe' }), certificadoPem, clavePem),
    );

    // Si la firma fuera "detached", el TRA no estaría y WSAA no tendría qué
    // leer.
    expect(Buffer.from(der, 'binary').toString('utf8')).toContain('<service>wsfe</service>');
  });

  it('con otra clave la verificación falla: el control sirve de algo', () => {
    const { certificadoPem, clavePem } = certificadoAutofirmado();
    const otra = generateKeyPairSync('rsa', { modulusLength: 2048 });

    const { bytesFirmados, firma } = firmaDelCms(
      firmarTraCms(construirTra({ servicio: 'wsfe' }), certificadoPem, clavePem),
    );

    expect(
      verificarFirma(
        'sha256',
        bytesFirmados,
        createPublicKey(otra.publicKey.export({ type: 'spki', format: 'pem' }).toString()),
        firma,
      ),
    ).toBe(false);
  });
});
