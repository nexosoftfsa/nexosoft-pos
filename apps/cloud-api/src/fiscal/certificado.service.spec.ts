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

/** Firma un certificado como haría ARCA con el CSR que le subimos. */
function certificadoDeMentira(csrPem: string, subjectExtra?: forge.pki.CertificateField[]): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.rsa.PublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 730 * 86400000);
  cert.setSubject(subjectExtra ?? csr.subject.attributes);
  cert.setIssuer([{ shortName: 'CN', value: 'AC ARCA de prueba' }]);
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
    const e = service.estado(DATOS.cuit);
    expect(e.tieneClave).toBe(false);
    expect(e.tieneCertificado).toBe(false);
    expect(e.certificado).toBeNull();
  });

  it('generar deja la clave y el pedido en disco, separados', () => {
    const r = service.generar(DATOS);

    expect(r.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
    expect(existsSync(r.archivo)).toBe(true);
    const estado = service.estado(DATOS.cuit);
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
    expect(service.estado('20-35678007-1').tieneClave).toBe(false);
  });

  it('guarda el certificado de ARCA y lee su vencimiento', () => {
    const pedido = service.generar(DATOS);
    const cert = certificadoDeMentira(pedido.csrPem);

    const datos = service.guardarCertificado(DATOS.cuit, cert);

    expect(datos.cuit).toBe('20356780079');
    const estado = service.estado(DATOS.cuit);
    expect(estado.tieneCertificado).toBe(true);
    expect(estado.diasParaVencer).toBeGreaterThan(700);
  });

  it('rechaza subir un certificado antes de generar el pedido', () => {
    const otro = service.generar({ ...DATOS, cuit: '30-71234567-1' });
    const cert = certificadoDeMentira(otro.csrPem);
    expect(() => service.guardarCertificado('27-12345678-0', cert)).toThrow(BadRequestException);
  });

  it('rechaza el certificado de otro comercio', () => {
    service.generar(DATOS);
    const otro = service.generar({ ...DATOS, cuit: '30-71234567-1', alias: 'otro' });
    const certDelOtro = certificadoDeMentira(otro.csrPem);

    expect(() => service.guardarCertificado(DATOS.cuit, certDelOtro)).toThrow(BadRequestException);
  });

  it('rechaza un certificado cuyo CUIT no es el del comercio', () => {
    const pedido = service.generar(DATOS);
    // Mismo par de claves, pero ARCA lo emitió a nombre de otro CUIT.
    const cert = certificadoDeMentira(pedido.csrPem, [
      { shortName: 'CN', value: 'NexoSoft-Prueba' },
      { name: 'serialNumber', value: 'CUIT 30712345671' },
    ]);

    expect(() => service.guardarCertificado(DATOS.cuit, cert)).toThrow(/y este comercio es/);
  });

  it('un certificado ilegible en disco no rompe el estado', () => {
    const pedido = service.generar(DATOS);
    expect(() => service.guardarCertificado(DATOS.cuit, 'basura')).toThrow(BadRequestException);
    expect(pedido.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
    expect(service.estado(DATOS.cuit).tieneCertificado).toBe(false);
  });
});
