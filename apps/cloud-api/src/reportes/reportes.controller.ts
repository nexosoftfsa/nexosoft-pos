import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RangoFechasDto, TopProductosDto, StockBajoDto } from './dto/rango-fechas.dto';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

/**
 * Reportes para el panel del dueño. Restringido a ADMIN/SUPERVISOR:
 * un cajero no ve reportes de gestión.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN, RolUsuario.SUPERVISOR)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('ventas/resumen')
  resumenVentas(@Request() req: { user: UsuarioJwt }, @Query() rango: RangoFechasDto) {
    return this.reportesService.resumenVentas(req.user.sucursalId, rango);
  }

  @Get('ventas/serie')
  serieDiaria(@Request() req: { user: UsuarioJwt }, @Query() rango: RangoFechasDto) {
    return this.reportesService.serieDiaria(req.user.sucursalId, rango);
  }

  @Get('ventas/por-medio-pago')
  porMedioPago(@Request() req: { user: UsuarioJwt }, @Query() rango: RangoFechasDto) {
    return this.reportesService.porMedioPago(req.user.sucursalId, rango);
  }

  @Get('ventas/por-terminal')
  porTerminal(@Request() req: { user: UsuarioJwt }, @Query() rango: RangoFechasDto) {
    return this.reportesService.porTerminal(req.user.sucursalId, rango);
  }

  @Get('productos/top')
  topProductos(@Request() req: { user: UsuarioJwt }, @Query() consulta: TopProductosDto) {
    return this.reportesService.topProductos(
      req.user.sucursalId,
      consulta,
      consulta.limite,
    );
  }

  @Get('stock/bajo')
  stockBajo(@Request() req: { user: UsuarioJwt }, @Query() consulta: StockBajoDto) {
    return this.reportesService.stockBajo(req.user.sucursalId, consulta.umbral);
  }

  /** Descarga el libro de ventas Excel (el que viaja a la nube propia del cliente). */
  @Get('libro-ventas')
  async libroVentas(
    @Res({ passthrough: true }) res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    const contenido = await this.reportesService.abrirLibroDeVentas();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ventas.xlsx"',
    });
    return new StreamableFile(contenido);
  }
}
