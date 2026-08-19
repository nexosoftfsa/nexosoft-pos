import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { armarPayload, generarTokenPlano, parsearPayload } from './credencial-payload';

export interface EstadoCredencial {
  readonly activa: boolean;
  readonly version: number;
  readonly creadaEn: Date;
  readonly ultimoUsoEn: Date | null;
}

export interface CredencialRegenerada {
  readonly payload: string;
  readonly version: number;
}

/**
 * Credencial de acceso por código de barras (Fase 15.A, ver ADR-0051). El
 * token nunca se persiste en claro — mismo criterio que Usuario.passwordHash.
 */
@Injectable()
export class CredencialesService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerEstado(usuarioId: string, sucursalId: string): Promise<EstadoCredencial | null> {
    await this.exigirUsuarioDeLaSucursal(usuarioId, sucursalId);

    const credencial = await this.prisma.credencialAcceso.findUnique({ where: { usuarioId } });
    if (!credencial) return null;

    return {
      activa: credencial.activa,
      version: credencial.version,
      creadaEn: credencial.creadaEn,
      ultimoUsoEn: credencial.ultimoUsoEn,
    };
  }

  async regenerar(usuarioId: string, sucursalId: string): Promise<CredencialRegenerada> {
    await this.exigirUsuarioDeLaSucursal(usuarioId, sucursalId);

    const tokenPlano = generarTokenPlano();
    const tokenHash = await argon2.hash(tokenPlano);

    const existente = await this.prisma.credencialAcceso.findUnique({ where: { usuarioId } });
    const version = (existente?.version ?? 0) + 1;

    await this.prisma.credencialAcceso.upsert({
      where: { usuarioId },
      create: { usuarioId, tokenHash, version },
      update: { tokenHash, version, activa: true, revocadaEn: null },
    });

    await this.auditar('CREDENCIAL_REGENERADA', usuarioId, sucursalId, true);

    return { payload: armarPayload(usuarioId, tokenPlano), version };
  }

  async revocar(usuarioId: string, sucursalId: string): Promise<void> {
    await this.exigirUsuarioDeLaSucursal(usuarioId, sucursalId);

    await this.prisma.credencialAcceso.updateMany({
      where: { usuarioId },
      data: { activa: false, revocadaEn: new Date() },
    });

    await this.auditar('CREDENCIAL_REVOCADA', usuarioId, sucursalId, true);
  }

  /**
   * Valida un código escaneado y devuelve el usuario si es válido. Cualquier
   * causa de rechazo (formato inválido, usuario inexistente, credencial
   * revocada, hash que no matchea, usuario inactivo) lanza el mismo mensaje
   * genérico para no permitir enumeración de usuarios.
   */
  async validar(payloadCrudo: string) {
    const parseado = parsearPayload(payloadCrudo);
    if (!parseado) throw new UnauthorizedException('Credencial inválida');

    const { usuarioId, tokenPlano } = parseado;
    const credencial = await this.prisma.credencialAcceso.findUnique({
      where: { usuarioId },
      include: { usuario: true },
    });

    if (!credencial || !credencial.activa || !credencial.usuario.activo) {
      await this.registrarFallo(usuarioId, credencial?.usuario.sucursalId);
      throw new UnauthorizedException('Credencial inválida');
    }

    const matchea = await argon2.verify(credencial.tokenHash, tokenPlano);
    if (!matchea) {
      await this.registrarFallo(usuarioId, credencial.usuario.sucursalId);
      throw new UnauthorizedException('Credencial inválida');
    }

    await this.prisma.credencialAcceso.update({
      where: { usuarioId },
      data: { ultimoUsoEn: new Date() },
    });
    await this.auditar('LOGIN_CREDENCIAL', usuarioId, credencial.usuario.sucursalId, true);

    return credencial.usuario;
  }

  private async registrarFallo(usuarioId: string, sucursalId: string | undefined) {
    if (!sucursalId) return; // sin sucursal conocida no hay dónde auditar (usuario inexistente)
    await this.auditar('LOGIN_CREDENCIAL_FALLIDO', usuarioId, sucursalId, false);
  }

  private async exigirUsuarioDeLaSucursal(usuarioId: string, sucursalId: string) {
    const existe = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, sucursalId },
    });
    if (!existe) throw new NotFoundException('Usuario no encontrado');
  }

  private async auditar(
    accion: string,
    usuarioId: string,
    sucursalId: string,
    exito: boolean,
  ): Promise<void> {
    await this.prisma.registroAuditoria.create({
      data: { accion, entidad: 'Usuario', entidadId: usuarioId, usuarioId, sucursalId, exito },
    });
  }
}
