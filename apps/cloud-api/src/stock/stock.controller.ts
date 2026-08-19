import { Controller, Get, Post, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { StockService } from './stock.service';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { ImportarStockDto } from './dto/importar-stock.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  saldosTodos(@Request() req: { user: UsuarioJwt }) {
    return this.stockService.saldosTodos(req.user.sucursalId);
  }

  // Debe declararse ANTES de `:productoId` para que no lo capture la ruta con parámetro.
  @Get('vencimientos')
  vencimientos(
    @Request() req: { user: UsuarioJwt },
    @Query('dias') dias?: string,
  ) {
    const n = dias !== undefined ? Number(dias) : 30;
    return this.stockService.vencimientos(
      req.user.sucursalId,
      Number.isFinite(n) ? n : 30,
    );
  }

  @Get(':productoId')
  saldoPorProducto(
    @Request() req: { user: UsuarioJwt },
    @Param('productoId') productoId: string,
  ) {
    return this.stockService.saldoPorProducto(req.user.sucursalId, productoId);
  }

  @Get(':productoId/lotes')
  lotes(
    @Request() req: { user: UsuarioJwt },
    @Param('productoId') productoId: string,
  ) {
    return this.stockService.lotesDeProducto(req.user.sucursalId, productoId);
  }

  @Get(':productoId/historial')
  historial(
    @Request() req: { user: UsuarioJwt },
    @Param('productoId') productoId: string,
  ) {
    return this.stockService.historialProducto(req.user.sucursalId, productoId);
  }

  @Post('movimientos')
  registrarMovimiento(
    @Request() req: { user: UsuarioJwt },
    @Body() dto: RegistrarMovimientoDto,
  ) {
    return this.stockService.registrarMovimiento(req.user.sucursalId, dto);
  }

  @Post('importar')
  importar(@Request() req: { user: UsuarioJwt }, @Body() dto: ImportarStockDto) {
    return this.stockService.importarStock(req.user.sucursalId, dto.filas, dto.dryRun);
  }
}
