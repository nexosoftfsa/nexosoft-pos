import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { TerminalesService } from './terminales.service';
import { CrearTerminalDto } from './dto/crear-terminal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('terminales')
export class TerminalesController {
  constructor(private readonly terminalesService: TerminalesService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }) {
    return this.terminalesService.listar(req.user.sucursalId);
  }

  @Post()
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearTerminalDto) {
    return this.terminalesService.crear(req.user.sucursalId, dto);
  }
}
