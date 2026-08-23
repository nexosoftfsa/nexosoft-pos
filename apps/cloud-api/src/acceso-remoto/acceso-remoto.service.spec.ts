import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AccesoRemotoService } from './acceso-remoto.service';
import { RevisionClavesService } from '../auth/revision-claves.service';

const ADMIN = { id: 'u1', rol: 'ADMIN' };

describe('AccesoRemotoService', () => {
  let carpeta: string;
  let archivo: string;
  let service: AccesoRemotoService;
  let revisionClaves: RevisionClavesService;

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'nexosoft-acceso-'));
    archivo = join(carpeta, 'acceso-remoto.json');
    process.env['ACCESO_REMOTO_ARCHIVO'] = archivo;
    revisionClaves = new RevisionClavesService();
    service = new AccesoRemotoService(revisionClaves);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    delete process.env['ACCESO_REMOTO_ARCHIVO'];
    await rm(carpeta, { recursive: true, force: true });
  });

  it('reporta "no-configurado" cuando el acceso remoto nunca se dio de alta en la PC', async () => {
    await expect(service.obtener()).resolves.toEqual({
      estado: 'no-configurado',
      url: null,
      alcanzable: null,
      mensaje: null,
      actualizadoEn: null,
    });
  });

  it('devuelve la dirección fija del comercio y confirma que responde desde afuera', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await writeFile(
      archivo,
      JSON.stringify({ estado: 'activo', url: 'https://lagus.nexosoft.com.ar' }),
    );

    const r = await service.obtener();

    expect(r.estado).toBe('activo');
    expect(r.url).toBe('https://lagus.nexosoft.com.ar');
    expect(r.alcanzable).toBe(true);
    // Prueba el camino real de ida y vuelta por Cloudflare, no el localhost.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://lagus.nexosoft.com.ar/api/v1/health',
      expect.anything(),
    );
  });

  it('marca alcanzable=false si el túnel está instalado pero no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await writeFile(
      archivo,
      JSON.stringify({ estado: 'activo', url: 'https://lagus.nexosoft.com.ar' }),
    );

    const r = await service.obtener();

    expect(r.estado).toBe('activo');
    expect(r.alcanzable).toBe(false);
  });

  it('cachea la comprobación para no salir a internet en cada refresco de la pantalla', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await writeFile(
      archivo,
      JSON.stringify({ estado: 'activo', url: 'https://lagus.nexosoft.com.ar' }),
    );

    await service.obtener();
    await service.obtener();
    await service.obtener();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no comprueba nada si el acceso remoto está apagado a propósito', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await writeFile(
      archivo,
      JSON.stringify({ estado: 'apagado', url: null, mensaje: 'Desactivado.' }),
    );

    const r = await service.obtener();

    expect(r.estado).toBe('apagado');
    expect(r.mensaje).toBe('Desactivado.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('aviso de contraseñas débiles (Fase 17.C)', () => {
    it('un ADMIN ve todas las contraseñas débiles conocidas', async () => {
      revisionClaves.revisar({ id: 'u1', email: 'admin@lagus.com', rol: 'ADMIN' }, 'Abcd1234');
      revisionClaves.revisar({ id: 'u2', email: 'marta@lagus.com', rol: 'CAJERO' }, 'marta123');

      const r = await service.obtenerPara(ADMIN);

      expect(r.clavesDebiles.map((c) => c.email).sort()).toEqual([
        'admin@lagus.com',
        'marta@lagus.com',
      ]);
    });

    it('quien no es ADMIN sólo ve la suya, no la de sus compañeros', async () => {
      revisionClaves.revisar({ id: 'u1', email: 'admin@lagus.com', rol: 'ADMIN' }, 'Abcd1234');
      revisionClaves.revisar({ id: 'u2', email: 'marta@lagus.com', rol: 'SUPERVISOR' }, 'marta123');

      const r = await service.obtenerPara({ id: 'u2', rol: 'SUPERVISOR' });

      expect(r.clavesDebiles).toHaveLength(1);
      expect(r.clavesDebiles[0]?.email).toBe('marta@lagus.com');
    });

    it('sin contraseñas débiles, la lista viene vacía', async () => {
      revisionClaves.revisar(
        { id: 'u1', email: 'admin@lagus.com', rol: 'ADMIN' },
        'Melon-Tractor-92',
      );

      const r = await service.obtenerPara(ADMIN);

      expect(r.clavesDebiles).toEqual([]);
    });

    it('avisa aunque el acceso remoto todavía no esté activado', async () => {
      revisionClaves.revisar({ id: 'u1', email: 'admin@lagus.com', rol: 'ADMIN' }, 'Abcd1234');

      const r = await service.obtenerPara(ADMIN);

      // Es justo el momento en que sirve el aviso: antes de publicar nada.
      expect(r.estado).toBe('no-configurado');
      expect(r.clavesDebiles).toHaveLength(1);
    });
  });

  it('un archivo corrupto no rompe la pantalla: se reporta como no-configurado', async () => {
    await writeFile(archivo, '{"estado":"acti');

    const r = await service.obtener();

    expect(r.estado).toBe('no-configurado');
    expect(r.mensaje).toContain('No se pudo leer');
  });
});
