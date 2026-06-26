import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { addDays } from 'date-fns';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { RegistroDto } from './dto/registro.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordOk = await argon2.verify(usuario.passwordHash, dto.password);
    if (!passwordOk) throw new UnauthorizedException('Credenciales inválidas');

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

    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRY') ?? '15m',
    });

    const refreshTokenStr = this.jwt.sign(
      { sub: usuarioId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '30d',
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
