import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { RemitosService } from './remitos.service';
import { CrearRemitoDto } from './dto/crear-remito.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('remitos')
export class RemitosController {
  constructor(private readonly remitos: RemitosService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }) {
    return this.remitos.listar(req.user.sucursalId);
  }

  @Post()
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearRemitoDto) {
    return this.remitos.crear(req.user.sucursalId, dto);
  }

  @Get(':id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.remitos.obtener(req.user.sucursalId, id);
  }

  @Post(':id/anular')
  anular(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.remitos.anular(req.user.sucursalId, id);
  }
}
