import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DestinoCarpeta } from './destino-carpeta';

describe('DestinoCarpeta', () => {
  let dir: string;
  let destino: DestinoCarpeta;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexo-respaldo-'));
    destino = new DestinoCarpeta(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('escribe y lee un respaldo (round-trip de bytes)', async () => {
    const contenido = Buffer.from('contenido-de-prueba');
    await destino.escribir('nexosoft-001.json.gz', contenido);

    const leido = await destino.leer('nexosoft-001.json.gz');
    expect(leido.toString()).toBe('contenido-de-prueba');
  });

  it('crea la carpeta si no existe', async () => {
    const subdir = join(dir, 'no', 'existe', 'todavia');
    const d = new DestinoCarpeta(subdir);
    await d.escribir('nexosoft-x.json.gz', Buffer.from('x'));
    const lista = await d.listar();
    expect(lista).toHaveLength(1);
  });

  it('lista sólo los respaldos de NexoSoft, ignorando archivos ajenos', async () => {
    await destino.escribir('nexosoft-001.json.gz', Buffer.from('a'));
    await destino.escribir('nexosoft-002.json.gz', Buffer.from('bb'));
    await fs.writeFile(join(dir, 'fotos-vacaciones.zip'), 'no tocar');
    await fs.writeFile(join(dir, 'otro.txt'), 'tampoco');

    const lista = await destino.listar();
    expect(lista).toHaveLength(2);
    // Ordenados del más nuevo al más viejo (por nombre desc)
    expect(lista[0]?.nombre).toBe('nexosoft-002.json.gz');
    expect(lista[1]?.nombre).toBe('nexosoft-001.json.gz');
  });

  it('reporta el tamaño en bytes', async () => {
    await destino.escribir('nexosoft-001.json.gz', Buffer.from('12345'));
    const lista = await destino.listar();
    expect(lista[0]?.tamanoBytes).toBe(5);
  });

  it('elimina un respaldo', async () => {
    await destino.escribir('nexosoft-001.json.gz', Buffer.from('a'));
    await destino.eliminar('nexosoft-001.json.gz');
    expect(await destino.listar()).toHaveLength(0);
  });

  it('eliminar es idempotente (no falla si no existe)', async () => {
    await expect(destino.eliminar('nexosoft-inexistente.json.gz')).resolves.toBeUndefined();
  });

  it('leer un respaldo inexistente lanza NotFoundException', async () => {
    await expect(destino.leer('nexosoft-fantasma.json.gz')).rejects.toThrow();
  });
});
