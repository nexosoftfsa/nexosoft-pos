import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { EstadoSuscripcion, Plan, type Licencia } from '@nexosoft/licencias';
import { verificarToken } from './verificar-firma';

/**
 * Los tests generan un par de claves Ed25519 de verdad y firman de verdad:
 * así queda fijado el formato exacto que el Worker va a tener que producir.
 */
let clavePublicaBase64: string;
let firmar: (licencia: unknown) => string;
let otraClavePublicaBase64: string;

beforeAll(() => {
  const par = generateKeyPairSync('ed25519');
  clavePublicaBase64 = par.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  firmar = (licencia: unknown) => {
    const payload = Buffer.from(JSON.stringify(licencia), 'utf8');
    const firma = sign(null, payload, par.privateKey);
    return `${payload.toString('base64url')}.${firma.toString('base64url')}`;
  };

  const impostor = generateKeyPairSync('ed25519');
  otraClavePublicaBase64 = impostor.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
});

const LICENCIA: Licencia = {
  comercioId: 'lagus',
  estado: EstadoSuscripcion.Activa,
  plan: Plan.Plus,
  vencePagoEl: '2026-09-10',
  validaHasta: '2026-08-30T00:00:00Z',
  emitidaEn: '2026-08-23T00:00:00Z',
  mensaje: null,
};

describe('verificarToken', () => {
  it('acepta un token firmado con la clave correcta', () => {
    expect(verificarToken(firmar(LICENCIA), clavePublicaBase64)).toEqual(LICENCIA);
  });

  it('conserva el mensaje del panel', () => {
    const conMensaje = { ...LICENCIA, mensaje: 'Pagá antes del viernes' };
    expect(verificarToken(firmar(conMensaje), clavePublicaBase64)?.mensaje).toBe(
      'Pagá antes del viernes',
    );
  });

  it('normaliza el mensaje ausente a null', () => {
    const { mensaje: _, ...sinMensaje } = LICENCIA;
    expect(verificarToken(firmar(sinMensaje), clavePublicaBase64)?.mensaje).toBeNull();
  });

  describe('el plan (ADR-0067)', () => {
    it('viaja firmado, así el comercio no puede ascenderse solo', () => {
      expect(verificarToken(firmar(LICENCIA), clavePublicaBase64)?.plan).toBe(Plan.Plus);
    });

    it('una licencia vieja, emitida antes de que existieran los planes, sigue siendo válida', () => {
      const { plan: _, ...vieja } = LICENCIA;
      const r = verificarToken(firmar(vieja), clavePublicaBase64);
      expect(r).not.toBeNull();
      // Sin plan explícito: `planDeLicencia` lo va a resolver como Premium.
      expect(r?.plan).toBeNull();
    });

    it('un plan que este servidor no conoce no invalida la licencia entera', () => {
      // Un Worker más nuevo que el servidor podría emitir un plan que acá
      // todavía no existe. Rechazar el token dejaría al comercio sin licencia
      // por una diferencia de versión nuestra.
      const r = verificarToken(firmar({ ...LICENCIA, plan: 'ENTERPRISE' }), clavePublicaBase64);
      expect(r).not.toBeNull();
      expect(r?.plan).toBeNull();
    });

    it('el plan no se puede cambiar sin la clave privada', () => {
      const token = firmar(LICENCIA);
      const [, firma] = token.split('.');
      const ascendida = Buffer.from(
        JSON.stringify({ ...LICENCIA, plan: Plan.Premium }),
        'utf8',
      ).toString('base64url');

      expect(verificarToken(`${ascendida}.${firma}`, clavePublicaBase64)).toBeNull();
    });
  });

  describe('lo que tiene que rechazar', () => {
    it('un token firmado con OTRA clave', () => {
      expect(verificarToken(firmar(LICENCIA), otraClavePublicaBase64)).toBeNull();
    });

    it('un token al que le cambiaron el contenido después de firmar', () => {
      const token = firmar(LICENCIA);
      const [, firma] = token.split('.');
      const alterada = Buffer.from(
        JSON.stringify({ ...LICENCIA, estado: EstadoSuscripcion.Bloqueada }),
        'utf8',
      ).toString('base64url');

      expect(verificarToken(`${alterada}.${firma}`, clavePublicaBase64)).toBeNull();
    });

    it('un token inventado sin firma válida', () => {
      const payload = Buffer.from(JSON.stringify(LICENCIA), 'utf8').toString('base64url');
      expect(verificarToken(`${payload}.deadbeef`, clavePublicaBase64)).toBeNull();
    });

    it('basura, texto vacío y formatos que no son el esperado', () => {
      for (const basura of ['', '   ', 'nada', 'a.b.c', '.', 'sinpunto']) {
        expect(verificarToken(basura, clavePublicaBase64)).toBeNull();
      }
    });

    it('un JSON válido y bien firmado pero que no es una licencia', () => {
      expect(verificarToken(firmar({ hola: 'mundo' }), clavePublicaBase64)).toBeNull();
    });

    it('una licencia con un estado que no existe', () => {
      expect(
        verificarToken(firmar({ ...LICENCIA, estado: 'GRATIS' }), clavePublicaBase64),
      ).toBeNull();
    });

    it('una clave pública inválida no rompe nada', () => {
      expect(verificarToken(firmar(LICENCIA), 'no-es-una-clave')).toBeNull();
      expect(verificarToken(firmar(LICENCIA), '')).toBeNull();
    });
  });
});
