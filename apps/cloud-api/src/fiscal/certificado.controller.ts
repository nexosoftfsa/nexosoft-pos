import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CertificadoService } from './certificado.service';
import { ConfiguracionFiscalService } from './configuracion-fiscal.service';
import { DiagnosticoArcaService } from './diagnostico-arca.service';
import { ALIAS_POR_DEFECTO } from './csr';
import type { EntornoArca } from './arca/wsaa';

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

  /**
   * Entorno al que pertenece el certificado. Si no viene, se usa el que el
   * comercio tiene activo — que es lo que quiere el 100% de las veces: uno
   * carga el certificado del entorno en el que está parado.
   */
  @IsString()
  @IsOptional()
  entorno?: string;
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
  constructor(
    private readonly certificados: CertificadoService,
    private readonly configuracion: ConfiguracionFiscalService,
    private readonly diagnosticos: DiagnosticoArcaService,
  ) {}

  /**
   * El entorno activo del comercio, salvo que el pedido diga otro.
   *
   * Por defecto homologación: si todavía no hay configuración, lo prudente es
   * asumir pruebas y no producción.
   */
  private async entornoDe(pedido?: string): Promise<EntornoArca> {
    if (pedido === 'produccion' || pedido === 'homologacion') return pedido;
    const fiscal = await this.configuracion.obtener();
    return fiscal?.entorno ?? 'homologacion';
  }

  @Get()
  async estado(@Query('cuit') cuit: string, @Query('entorno') entorno?: string) {
    return this.certificados.estado(cuit ?? '', await this.entornoDe(entorno));
  }

  @Post('csr')
  generar(@Body() dto: GenerarCsrDto) {
    return this.certificados.generar(
      { cuit: dto.cuit, razonSocial: dto.razonSocial, alias: dto.alias ?? ALIAS_POR_DEFECTO },
      dto.forzar ?? false,
    );
  }

  @Put()
  async subir(@Body() dto: SubirCertificadoDto) {
    return this.certificados.guardarCertificado(
      dto.cuit,
      dto.certificadoPem,
      await this.entornoDe(dto.entorno),
    );
  }

  /**
   * Prueba el circuito con ARCA sin emitir nada, y dice en cuál de los tres
   * pasos se traba: llegar a ARCA, autenticar con el certificado, o consultar
   * el punto de venta.
   */
  @Get('diagnostico')
  diagnostico() {
    return this.diagnosticos.correr();
  }
}
