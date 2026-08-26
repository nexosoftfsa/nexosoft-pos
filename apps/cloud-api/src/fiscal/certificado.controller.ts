import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CertificadoService } from './certificado.service';
import { ALIAS_POR_DEFECTO } from './csr';

export class GenerarCsrDto {
  @IsString()
  @IsNotEmpty()
  cuit!: string;

  @IsString()
  @IsNotEmpty()
  razonSocial!: string;

  @IsString()
  @IsOptional()
  alias?: string;

  /** Regenerar pisando la clave anterior. Invalida el certificado ya emitido. */
  @IsBoolean()
  @IsOptional()
  forzar?: boolean;
}

export class SubirCertificadoDto {
  @IsString()
  @IsNotEmpty()
  cuit!: string;

  @IsString()
  @IsNotEmpty()
  certificadoPem!: string;
}

/**
 * Certificado de facturación electrónica de ARCA (Fase 18).
 *
 * Sirve para que el comercio no tenga que instalar openssl ni tipear un
 * "subject" de OpenSSL: el servidor genera la clave y el pedido, y después
 * recibe el certificado que ARCA devuelve.
 *
 * Lo que NO se puede automatizar es el trámite en sí: ARCA no lo expone por
 * API, es un formulario detrás de la Clave Fiscal del contribuyente. Eso lo
 * hace el comercio (con nosotros al lado), una sola vez.
 *
 * Solo ADMIN: es la identidad fiscal del comercio.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN)
@Controller('fiscal/certificado')
export class CertificadoController {
  constructor(private readonly certificados: CertificadoService) {}

  @Get()
  estado(@Query('cuit') cuit: string) {
    return this.certificados.estado(cuit ?? '');
  }

  @Post('csr')
  generar(@Body() dto: GenerarCsrDto) {
    return this.certificados.generar(
      { cuit: dto.cuit, razonSocial: dto.razonSocial, alias: dto.alias ?? ALIAS_POR_DEFECTO },
      dto.forzar ?? false,
    );
  }

  @Put()
  subir(@Body() dto: SubirCertificadoDto) {
    return this.certificados.guardarCertificado(dto.cuit, dto.certificadoPem);
  }
}
