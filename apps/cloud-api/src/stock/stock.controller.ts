import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { StockService } from './stock.service';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
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

  @Get(':productoId')
  saldoPorProducto(
    @Request() req: { user: UsuarioJwt },
    @Param('productoId') productoId: string,
  ) {
    return this.stockService.saldoPorProducto(req.user.sucursalId, productoId);
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
}
