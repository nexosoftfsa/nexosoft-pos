import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Id fijo de la única fila de configuración (mismo patrón que AsistenteService, ADR-0040). */
const ID_CONFIG = 1;

export interface EstadoLogo {
  readonly logoBase64: string | null;
}

/**
 * Logo del comercio para el panel web (admin-web). El POS tiene su propia
 * copia local en SQLite (independiente, offline-first) — esto solo existe
 * para que admin-web, que corre en otra máquina/navegador, pueda mostrarlo.
 */
@Injectable()
export class ComercioService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerLogo(): Promise<EstadoLogo> {
    const fila = await this.prisma.configuracionSistema.findUnique({ where: { id: ID_CONFIG } });
    return { logoBase64: fila?.logoBase64 ?? null };
  }

  async actualizarLogo(logoBase64: string): Promise<EstadoLogo> {
    const valor = logoBase64.trim() === '' ? null : logoBase64;
    const fila = await this.prisma.configuracionSistema.upsert({
      where: { id: ID_CONFIG },
      create: { id: ID_CONFIG, logoBase64: valor },
      update: { logoBase64: valor },
    });
    return { logoBase64: fila.logoBase64 };
  }
}
