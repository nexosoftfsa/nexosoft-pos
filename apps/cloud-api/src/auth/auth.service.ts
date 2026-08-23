import {
  HttpException,
  HttpStatus,
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { addDays } from 'date-fns';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CredencialesService } from '../credenciales/credenciales.service';
import { LoginLockoutService } from './login-lockout.service';
import { RevisionClavesService } from './revision-claves.service';
import type { RegistroDto } from './dto/registro.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './jwt.strategy';

const MENSAJE_BLOQUEADO =
  'Demasiados intentos fallidos. Probá de nuevo en unos minutos.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly credenciales: CredencialesService,
    private readonly lockout: LoginLockoutService,
    private readonly revisionClaves: RevisionClavesService,
  ) {}

  async registrar(dto: RegistroDto) {
    const existe = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existe) throw new ConflictException('El email ya está registrado');

    const passwordHash = await argon2.hash(dto.password);

    const usuario = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        nombreDisplay: dto.nombreDisplay,
        passwordHash,
        rol: dto.rol ?? 'CAJERO',
        sucursalId: dto.sucursalId,
      },
      select: { id: true, email: true, nombreDisplay: true, rol: true, sucursalId: true },
    });

    return usuario;
  }

  async login(dto: LoginDto) {
    if (this.lockout.estaBloqueado(dto.email)) {
      await this.auditarBloqueo(dto.email);
      throw new HttpException(MENSAJE_BLOQUEADO, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Se trae el nombre del comercio junto con el usuario: es la pista más
    // útil para detectar la contraseña típica ("lagus2026") unas líneas más
    // abajo, y sale en la misma consulta.
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
      include: { sucursal: { select: { nombre: true } } },
    });

    if (!usuario || !usuario.activo) {
      this.lockout.registrarFallo(dto.email);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordOk = await argon2.verify(usuario.passwordHash, dto.password);
    if (!passwordOk) {
      this.lockout.registrarFallo(dto.email);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.lockout.registrarExito(dto.email);
    // Único momento en que el servidor ve la contraseña en claro: se aprovecha
    // para evaluar si aguanta estar publicada en internet (Fase 17.C). No se
    // guarda la contraseña, sólo el veredicto. No bloquea el login.
    this.revisionClaves.revisar(usuario, dto.password, {
      email: usuario.email,
      nombreComercio: usuario.sucursal?.nombre,
    });
    return this.generarTokens(usuario.id, usuario.email, usuario.rol, usuario.sucursalId);
  }

  /**
   * Audita el bloqueo por intentos fallidos -- solo si el email corresponde a
   * un usuario real (si no, no hay sucursalId conocido para el registro, y
   * nada sensible que dejar asentado: ver LoginLockoutService).
   */
  private async auditarBloqueo(email: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) return;
    await this.prisma.registroAuditoria.create({
      data: {
        accion: 'LOGIN_BLOQUEADO',
        entidad: 'Usuario',
        entidadId: usuario.id,
        usuarioId: usuario.id,
        sucursalId: usuario.sucursalId,
        exito: false,
      },
    });
  }

  /**
   * Login alternativo por credencial física (escaneo de código de barras,
   * Fase 15.A / ADR-0051). Devuelve el mismo par de tokens que `login()`.
   */
  async loginConCredencial(payloadCrudo: string) {
    const usuario = await this.credenciales.validar(payloadCrudo);
    return this.generarTokens(usuario.id, usuario.email, usuario.rol, usuario.sucursalId);
  }

  async refresh(tokenStr: string) {
    const record = await this.prisma.refreshToken.findUnique({ where: { token: tokenStr } });

    if (!record || record.expiraEn < new Date()) {
      if (record) {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
      }
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    await this.prisma.refreshToken.delete({ where: { id: record.id } });

    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: record.usuarioId },
      select: { id: true, email: true, rol: true, sucursalId: true, activo: true },
    });

    if (!usuario.activo) throw new UnauthorizedException('Usuario inactivo');

    return this.generarTokens(usuario.id, usuario.email, usuario.rol, usuario.sucursalId);
  }

  private async generarTokens(
    usuarioId: string,
    email: string,
    rol: string,
    sucursalId: string,
  ) {
    const payload: JwtPayload = { sub: usuarioId, email, rol, sucursalId };

    // El valor viene de config (string en runtime); la librería lo parsea con `ms`.
    const accessExpiry = (this.config.get<string>('JWT_ACCESS_EXPIRY') ??
      '15m') as NonNullable<JwtSignOptions['expiresIn']>;
    const refreshExpiry = (this.config.get<string>('JWT_REFRESH_EXPIRY') ??
      '30d') as NonNullable<JwtSignOptions['expiresIn']>;

    const accessToken = this.jwt.sign(payload, { expiresIn: accessExpiry });

    const refreshTokenStr = this.jwt.sign(
      { sub: usuarioId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiry,
      },
    );

    const diasRefresh = parseInt(
      this.config.get<string>('JWT_REFRESH_DAYS') ?? '30',
      10,
    );

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenStr,
        usuarioId,
        expiraEn: addDays(new Date(), diasRefresh),
      },
    });

    return { accessToken, refreshToken: refreshTokenStr };
  }
}
