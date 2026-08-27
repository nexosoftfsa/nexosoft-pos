import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ConfiguracionFiscalService } from './configuracion-fiscal.service';

export class GuardarConfiguracionFiscalDto {
  @IsString()
  @IsOptional()
  cuit?: string;

  @IsString()
  @IsOptional()
  razonSocial?: string;

  @IsInt()
  @Min(1)
  // ARCA usa 5 dígitos para el punto de venta.
  @Max(99999)
  @IsOptional()
  puntoDeVenta?: number;

  // Las condiciones del dominio (`CondicionIva`). Se listan acá y no se
  // importan porque el DTO se valida en runtime con class-validator.
  @IsIn([
    'ResponsableInscripto',
    'Monotributo',
    'ConsumidorFinal',
    'Exento',
    'NoCategorizado',
  ])
  @IsOptional()
  condicionIvaEmisor?: string;

  @IsIn(['homologacion', 'produccion'])
  @IsOptional()
  arcaEntorno?: string;
}

/**
 * Datos fiscales del comercio (CUIT, punto de venta, condición frente al IVA).
 *
 * Viven en el SERVIDOR porque es el que le pide el CAE a ARCA: si cada terminal
 * tuviera su propio punto de venta, la numeración se rompería.
 *
 * Solo ADMIN: de esto depende con qué identidad se factura.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN)
@Controller('fiscal/configuracion')
export class ConfiguracionFiscalController {
  constructor(private readonly config: ConfiguracionFiscalService) {}

  @Get()
  async obtener() {
    const config = await this.config.obtener();
    // `null` no es un error: es un comercio que todavía no está de alta.
    return { completa: config !== null, config };
  }

  @Put()
  async guardar(@Body() dto: GuardarConfiguracionFiscalDto) {
    const config = await this.config.guardar(dto);
    return { completa: config !== null, config };
  }
}
