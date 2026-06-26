import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import type {
  DestinoDeRespaldo,
  MetadatosRespaldo,
} from '../puertos/destino-de-respaldo';

/**
 * Destino de respaldo sobre el filesystem (ADR-0020).
 *
 * Escribe los snapshots en una carpeta configurable. Si esa carpeta es la de
 * Google Drive / OneDrive Desktop, la nube los sube sola, sin integrar ninguna
 * API. También sirve para un disco externo, un NAS o una carpeta local.
 *
 * Sólo gestiona los archivos cuyo nombre empieza con el prefijo de NexoSoft,
 * para no tocar otros archivos que el cliente tenga en la misma carpeta.
 */
export class DestinoCarpeta implements DestinoDeRespaldo {
  private static readonly PREFIJO = 'nexosoft-';
  private static readonly SUFIJO = '.json.gz';

  constructor(private readonly rutaCarpeta: string) {}

  private async asegurarCarpeta(): Promise<void> {
    await fs.mkdir(this.rutaCarpeta, { recursive: true });
  }

  async escribir(nombre: string, contenido: Buffer): Promise<void> {
    await this.asegurarCarpeta();
    await fs.writeFile(join(this.rutaCarpeta, nombre), contenido);
  }

  async leer(nombre: string): Promise<Buffer> {
    try {
      return await fs.readFile(join(this.rutaCarpeta, nombre));
    } catch {
      throw new NotFoundException(`Respaldo ${nombre} no encontrado`);
    }
  }

  async listar(): Promise<MetadatosRespaldo[]> {
    await this.asegurarCarpeta();
    const archivos = await fs.readdir(this.rutaCarpeta);

    const respaldos = archivos.filter(
      (n) => n.startsWith(DestinoCarpeta.PREFIJO) && n.endsWith(DestinoCarpeta.SUFIJO),
    );

    const metadatos = await Promise.all(
      respaldos.map(async (nombre) => {
        const stat = await fs.stat(join(this.rutaCarpeta, nombre));
        return { nombre, creadoEn: stat.mtime, tamanoBytes: stat.size };
      }),
    );

    return metadatos.sort((a, b) => b.nombre.localeCompare(a.nombre));
  }

  async eliminar(nombre: string): Promise<void> {
    try {
      await fs.unlink(join(this.rutaCarpeta, nombre));
    } catch {
      // si ya no existe, lo damos por eliminado (idempotente)
    }
  }
}
