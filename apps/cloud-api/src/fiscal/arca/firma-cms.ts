/**
 * Firma del TRA en CMS/PKCS#7, que es como WSAA lo exige.
 *
 * ARCA no acepta el XML pelado: hay que envolverlo en una estructura CMS
 * firmada con el certificado del comercio y su clave privada, y mandarla en
 * base64. Es el paso donde el certificado sirve para algo.
 *
 * Se usa node-forge y no openssl por línea de comandos: en la PC de un
 * comercio no hay openssl, y depender de un ejecutable externo para poder
 * facturar sería frágil.
 */
import * as forge from 'node-forge';

export class ErrorFirmaCms extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorFirmaCms';
  }
}

/**
 * Devuelve el CMS firmado, en base64, listo para mandarle a `LoginCms`.
 *
 * @param tra XML del ticket de requerimiento (ver `construirTra`).
 * @param certificadoPem El .crt que emitió ARCA.
 * @param clavePrivadaPem La clave con la que se generó el pedido.
 */
export function firmarTraCms(
  tra: string,
  certificadoPem: string,
  clavePrivadaPem: string,
): string {
  let certificado: forge.pki.Certificate;
  let clave: forge.pki.rsa.PrivateKey;
  try {
    certificado = forge.pki.certificateFromPem(certificadoPem);
  } catch {
    throw new ErrorFirmaCms(
      'El certificado guardado no se puede leer. Volvé a cargarlo en Configuración.',
    );
  }
  try {
    clave = forge.pki.privateKeyFromPem(clavePrivadaPem);
  } catch {
    throw new ErrorFirmaCms('La clave privada del certificado no se puede leer.');
  }

  // Que la clave sea la del certificado se verifica al cargarlo, pero acá
  // vuelve a chequearse: firmar con la clave equivocada produce un CMS que
  // ARCA rechaza con un mensaje que no explica nada.
  const publicaDelCert = certificado.publicKey as forge.pki.rsa.PublicKey;
  if (publicaDelCert.n.toString(16) !== clave.n.toString(16)) {
    throw new ErrorFirmaCms(
      'El certificado y la clave privada no son del mismo par. Generá el pedido de nuevo y volvé a sacar el certificado en ARCA.',
    );
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(certificado);
  p7.addSigner({
    key: clave,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids['sha256'] as string,
    // Los OIDs de node-forge vienen tipados como `string | undefined` porque
    // el diccionario es un índice abierto; acá son constantes conocidas.
    authenticatedAttributes: [
      { type: forge.pki.oids['contentType'] as string, value: forge.pki.oids['data'] as string },
      { type: forge.pki.oids['messageDigest'] as string },
      { type: forge.pki.oids['signingTime'] as string, value: new Date().toISOString() },
    ],
  });
  // `detached: false`: el TRA viaja adentro del CMS. ARCA lo necesita así.
  p7.sign({ detached: false });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}
