import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as forge from 'node-forge';

import { CertificadoService } from './certificado.service';

const DATOS = {
  cuit: '20-35678007-9',
  razonSocial: 'Rivarola Sergio Sebastian',
  alias: 'NexoSoft-Prueba',
};

/**
 * Firma un certificado como haría ARCA con el CSR que le subimos.
 *
 * `emisor` importa: ARCA tiene una autoridad certificante para producción y
 * otra para homologación, y es lo único del archivo que dice de cuál salió.
 */
function certificadoDeMentira(
  csrPem: string,
  opciones: { subject?: forge.pki.CertificateField[]; emisor?: string } = {},
): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.rsa.PublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 730 * 86400000);
  cert.setSubject(opciones.subject ?? csr.subject.attributes);
  cert.setIssuer([{ shortName: 'CN', value: opciones.emisor ?? 'AC ARCA de prueba' }]);
  cert.sign(forge.pki.rsa.generateKeyPair(512).privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

describe('CertificadoService', () => {
  let carpeta: string;
  let service: CertificadoService;

  beforeEach(() => {
    carpeta = mkdtempSync(join(tmpdir(), 'nexosoft-cert-'));
    service = new CertificadoService({
      get: (clave: string) => (clave === 'FISCAL_SECRETS_DIR' ? carpeta : undefined),
    } as never);
  });

  afterEach(() => {
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('sin nada generado, el estado lo dice', () => {
    const e = service.estado(DATOS.cuit, 'produccion');
    expect(e.tieneClave).toBe(false);
    expect(e.tieneCertificado).toBe(false);
    expect(e.certificado).toBeNull();
    expect(e.hayCertificadoDelOtroEntorno).toBe(false);
  });

  it('generar deja la clave y el pedido en disco, separados', () => {
    const r = service.generar(DATOS);

    expect(r.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
    expect(existsSync(r.archivo)).toBe(true);
    const estado = service.estado(DATOS.cuit, 'produccion');
    expect(estado.tieneClave).toBe(true);
    expect(estado.alias).toBe('NexoSoft-Prueba');
    // El pedido que se sube a ARCA no puede llevar la clave privada.
    expect(readFileSync(r.archivo, 'utf8')).not.toContain('PRIVATE KEY');
  });

  it('NO pisa una clave ya generada', () => {
    // Regenerar deja inservible el certificado que ARCA ya emitio: el comercio
    // se queda sin poder facturar y hay que rehacer el tramite.
    service.generar(DATOS);
    expect(() => service.generar(DATOS)).toThrow(ConflictException);
  });

  it('con forzar sí la reemplaza', () => {
    const primera = service.generar(DATOS);
    const segunda = service.generar(DATOS, true);
    expect(segunda.csrPem).not.toBe(primera.csrPem);
  });

  it('rechaza un CUIT inválido antes de escribir nada', () => {
    expect(() => service.generar({ ...DATOS, cuit: '20-35678007-1' })).toThrow(BadRequestException);
    expect(service.estado('20-35678007-1', 'produccion').tieneClave).toBe(false);
  });

  it('guarda el certificado de ARCA y lee su vencimiento', () => {
    const pedido = service.generar(DATOS);
    const cert = certificadoDeMentira(pedido.csrPem);

    const datos = service.guardarCertificado(DATOS.cuit, cert, 'produccion');

    expect(datos.cuit).toBe('20356780079');
    const estado = service.estado(DATOS.cuit, 'produccion');
    expect(estado.tieneCertificado).toBe(true);
    expect(estado.diasParaVencer).toBeGreaterThan(700);
  });

  it('rechaza subir un certificado antes de generar el pedido', () => {
    const otro = service.generar({ ...DATOS, cuit: '30-71234567-1' });
    const cert = certificadoDeMentira(otro.csrPem);
    expect(() => service.guardarCertificado('27-12345678-0', cert, 'produccion')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza el certificado de otro comercio', () => {
    service.generar(DATOS);
    const otro = service.generar({ ...DATOS, cuit: '30-71234567-1', alias: 'otro' });
    const certDelOtro = certificadoDeMentira(otro.csrPem);

    expect(() => service.guardarCertificado(DATOS.cuit, certDelOtro, 'produccion')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza un certificado cuyo CUIT no es el del comercio', () => {
    const pedido = service.generar(DATOS);
    // Mismo par de claves, pero ARCA lo emitió a nombre de otro CUIT.
    const cert = certificadoDeMentira(pedido.csrPem, {
      subject: [
        { shortName: 'CN', value: 'NexoSoft-Prueba' },
        { name: 'serialNumber', value: 'CUIT 30712345671' },
      ],
    });

    expect(() => service.guardarCertificado(DATOS.cuit, cert, 'produccion')).toThrow(
      /y este comercio es/,
    );
  });

  it('un certificado ilegible en disco no rompe el estado', () => {
    const pedido = service.generar(DATOS);
    expect(() => service.guardarCertificado(DATOS.cuit, 'basura', 'produccion')).toThrow(
      BadRequestException,
    );
    expect(pedido.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
    expect(service.estado(DATOS.cuit, 'produccion').tieneCertificado).toBe(false);
  });

  /**
   * ARCA tiene dos autoridades certificantes que no se reconocen entre sí. El
   * 4/9/2026 se pasó el POS a homologación para probar Facturas A y B con el
   * certificado de producción cargado, y ARCA rechazó TODO con "Certificado no
   * emitido por AC de confianza" — un mensaje que no habla de entornos.
   */
  describe('un certificado por entorno', () => {
    it('el de homologación no pisa al de producción', () => {
      const pedido = service.generar(DATOS);
      const deProduccion = certificadoDeMentira(pedido.csrPem, { emisor: 'AC ARCA' });
      const deHomologacion = certificadoDeMentira(pedido.csrPem, {
        emisor: 'AC ARCA Homologacion',
      });

      service.guardarCertificado(DATOS.cuit, deProduccion, 'produccion');
      service.guardarCertificado(DATOS.cuit, deHomologacion, 'homologacion');

      expect(service.materialDeFirma(DATOS.cuit, 'produccion')?.certificadoPem).toBe(deProduccion);
      expect(service.materialDeFirma(DATOS.cuit, 'homologacion')?.certificadoPem).toBe(
        deHomologacion,
      );
    });

    it('la clave privada es una sola: el mismo pedido sirve para los dos', () => {
      const pedido = service.generar(DATOS);
      service.guardarCertificado(DATOS.cuit, certificadoDeMentira(pedido.csrPem), 'produccion');
      service.guardarCertificado(DATOS.cuit, certificadoDeMentira(pedido.csrPem), 'homologacion');

      expect(service.materialDeFirma(DATOS.cuit, 'produccion')?.clavePrivadaPem).toBe(
        service.materialDeFirma(DATOS.cuit, 'homologacion')?.clavePrivadaPem,
      );
    });

    it('falta el de este entorno, pero avisa que existe el del otro', () => {
      const pedido = service.generar(DATOS);
      service.guardarCertificado(DATOS.cuit, certificadoDeMentira(pedido.csrPem), 'produccion');

      const enHomologacion = service.estado(DATOS.cuit, 'homologacion');
      expect(enHomologacion.tieneCertificado).toBe(false);
      expect(enHomologacion.hayCertificadoDelOtroEntorno).toBe(true);
      expect(enHomologacion.entorno).toBe('homologacion');
      // La clave sigue estando: NO hay que generar un pedido nuevo.
      expect(enHomologacion.tieneClave).toBe(true);
      expect(service.materialDeFirma(DATOS.cuit, 'homologacion')).toBeNull();
    });

    it('no deja guardar como producción uno emitido por la AC de homologación', () => {
      const pedido = service.generar(DATOS);
      const cert = certificadoDeMentira(pedido.csrPem, { emisor: 'AC de Homologacion AFIP' });

      expect(() => service.guardarCertificado(DATOS.cuit, cert, 'produccion')).toThrow(
        /HOMOLOGACIÓN/,
      );
      expect(service.estado(DATOS.cuit, 'produccion').tieneCertificado).toBe(false);
    });

    /**
     * Al revés no hay marca confiable —la AC de producción no se nombra— así
     * que no se inventa una: un aviso falso acá haría dudar del archivo bueno.
     */
    it('sí deja guardar como homologación uno que no dice de dónde salió', () => {
      const pedido = service.generar(DATOS);
      const cert = certificadoDeMentira(pedido.csrPem, { emisor: 'AC ARCA' });
      expect(() => service.guardarCertificado(DATOS.cuit, cert, 'homologacion')).not.toThrow();
    });

    /**
     * El de producción se sigue llamando `certificado.crt`, sin sufijo: todo
     * comercio ya instalado tiene ese archivo y es el de producción. Si se
     * renombrara, la actualización lo dejaría sin poder facturar.
     */
    it('el de producción conserva el nombre de archivo de siempre', () => {
      const pedido = service.generar(DATOS);
      service.guardarCertificado(DATOS.cuit, certificadoDeMentira(pedido.csrPem), 'produccion');

      expect(existsSync(join(carpeta, 'arca', '20356780079', 'certificado.crt'))).toBe(true);
    });
  });
});
