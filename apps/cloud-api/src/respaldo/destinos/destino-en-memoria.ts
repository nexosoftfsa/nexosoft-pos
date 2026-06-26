import { NotFoundException } from '@nestjs/common';
import type {
  DestinoDeRespaldo,
  MetadatosRespaldo,
} from '../puertos/destino-de-respaldo';

/**
 * Mock funcional del destino de respaldo. Guarda los respaldos en memoria.
 * Útil para tests y para desarrollo sin tocar el disco.
 */
export class DestinoEnMemoria implements DestinoDeRespaldo {
  private readonly almacen = new Map<string, { contenido: Buffer; creadoEn: Date }>();

  escribir(nombre: string, contenido: Buffer): Promise<void> {
    this.almacen.set(nombre, { contenido: Buffer.from(contenido), creadoEn: new Date() });
    return Promise.resolve();
  }

  leer(nombre: string): Promise<Buffer> {
    const item = this.almacen.get(nombre);
    if (!item) throw new NotFoundException(`Respaldo ${nombre} no encontrado`);
    return Promise.resolve(item.contenido);
  }

  listar(): Promise<MetadatosRespaldo[]> {
    const lista = [...this.almacen.entries()]
      .map(([nombre, { contenido, creadoEn }]) => ({
        nombre,
        creadoEn,
        tamanoBytes: contenido.byteLength,
      }))
      .sort((a, b) => b.nombre.localeCompare(a.nombre));
    return Promise.resolve(lista);
  }

  eliminar(nombre: string): Promise<void> {
    this.almacen.delete(nombre);
    return Promise.resolve();
  }
}
