/**
 * Generación del pedido de certificado (CSR) para ARCA.
 *
 * ARCA no emite el certificado de facturación electrónica por API: hay un
 * formulario web detrás de la Clave Fiscal del contribuyente. Lo que SÍ se
 * puede hacer del lado nuestro es todo lo demás — la clave privada y el CSR —
 * para que el comercio no tenga que instalar openssl ni tipear nada.
 *
 * El subject que exige ARCA no perdona:
 *
 *     C=AR, O=<razón social>, CN=<nombre del sistema>, serialNumber=CUIT <11 dígitos>
 *
 * con la palabra `CUIT`, un espacio y el número SIN guiones. Tipeado a mano
 * falla, y falla tarde: el certificado se emite igual y recién no anda al
 * primer intento de facturar.
 *
 * La clave se genera con `node:crypto` (nativo, instantáneo) y el CSR se arma
 * y se firma con node-forge, que es pure JS. Hacer las dos cosas con forge
 * tardaría varios segundos en una PC de comercio.
 */
import { generateKeyPairSync } from 'node:crypto';
import * as forge from 'node-forge';
import { cuitEsValido, normalizarCuit } from '@nexosoft/domain';

export interface DatosCsr {
  readonly cuit: string;
  readonly razonSocial: string;
  /** Nombre con el que se identifica este sistema ante ARCA (el "alias"). */
  readonly alias: string;
}

export interface CsrGenerado {
  readonly csrPem: string;
  readonly clavePrivadaPem: string;
  /** El subject ya armado, para mostrarlo y poder compararlo con lo que pide ARCA. */
  readonly subject: string;
}

export class ErrorCsr extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorCsr';
  }
}

/** Alias por defecto si el comercio no elige uno. ARCA no acepta espacios acá. */
export const ALIAS_POR_DEFECTO = 'nexosoft';

/**
 * Normaliza el alias: ARCA lo usa como CN y rechaza espacios y acentos.
 * Se limita el largo porque el campo del formulario también lo limita.
 */
export function normalizarAlias(alias: string): string {
  const limpio = alias
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return limpio === '' ? ALIAS_POR_DEFECTO : limpio;
}

/** El subject exacto que espera ARCA, como string legible. */
export function construirSubject(datos: DatosCsr): string {
  const cuit = normalizarCuit(datos.cuit);
  return `C=AR, O=${datos.razonSocial.trim()}, CN=${normalizarAlias(datos.alias)}, serialNumber=CUIT ${cuit}`;
}

/** Genera la clave privada y el CSR. No escribe nada en disco. */
export function generarCsr(datos: DatosCsr): CsrGenerado {
  const cuit = normalizarCuit(datos.cuit);
  if (!cuitEsValido(cuit)) {
    throw new ErrorCsr(
      `El CUIT "${datos.cuit}" no es válido. Revisalo en Configuración antes de pedir el certificado.`,
    );
  }
  const razonSocial = datos.razonSocial.trim();
  if (razonSocial === '') {
    throw new ErrorCsr('Falta la razón social del comercio. Completala en Configuración.');
  }

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clavePrivadaPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

  const claveForge = forge.pki.privateKeyFromPem(clavePrivadaPem);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(claveForge.n, claveForge.e);
  csr.setSubject([
    { shortName: 'C', value: 'AR' },
    { shortName: 'O', value: razonSocial },
    { shortName: 'CN', value: normalizarAlias(datos.alias) },
    { name: 'serialNumber', value: `CUIT ${cuit}` },
  ]);
  csr.sign(claveForge, forge.md.sha256.create());

  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    clavePrivadaPem,
    subject: construirSubject(datos),
  };
}

export interface DatosCertificado {
  readonly subject: string;
  readonly emisor: string;
  /** ISO 8601. */
  readonly validoDesde: string;
  readonly validoHasta: string;
  /** CUIT que ARCA puso en el certificado, ya sin la palabra "CUIT". */
  readonly cuit: string | null;
}

/**
 * Lee el certificado que devolvió ARCA y verifica que corresponda a NUESTRA
 * clave privada. Sin este chequeo, subir el archivo equivocado se descubre
 * recién al facturar, con un error de ARCA que no explica nada.
 */
export function leerCertificado(certificadoPem: string, clavePrivadaPem: string): DatosCertificado {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificadoPem);
  } catch {
    throw new ErrorCsr(
      'Ese archivo no parece un certificado de ARCA. Tiene que ser el .crt que descargaste, en texto (empieza con BEGIN CERTIFICATE).',
    );
  }

  const claveNuestra = forge.pki.privateKeyFromPem(clavePrivadaPem);
  const publicaDelCert = cert.publicKey as forge.pki.rsa.PublicKey;
  if (publicaDelCert.n.toString(16) !== claveNuestra.n.toString(16)) {
    throw new ErrorCsr(
      'Ese certificado no corresponde a la clave de esta PC. Puede ser de otro comercio, o de un pedido anterior. Generá el pedido de nuevo y subí el certificado que salga de ese.',
    );
  }

  const campo = (nombre: string): string | null => {
    const attr = cert.subject.attributes.find((a) => a.shortName === nombre || a.name === nombre);
    return typeof attr?.value === 'string' ? attr.value : null;
  };
  const serial = campo('serialNumber');

  return {
    subject: cert.subject.attributes
      .map((a) => `${a.shortName ?? a.name}=${String(a.value)}`)
      .join(', '),
    emisor: cert.issuer.attributes
      .map((a) => `${a.shortName ?? a.name}=${String(a.value)}`)
      .join(', '),
    validoDesde: cert.validity.notBefore.toISOString(),
    validoHasta: cert.validity.notAfter.toISOString(),
    cuit: serial === null ? null : normalizarCuit(serial),
  };
}
