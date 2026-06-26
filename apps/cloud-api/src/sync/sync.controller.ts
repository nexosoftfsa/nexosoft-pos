import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SincronizarDto } from './dto/sincronizar.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  email: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('operaciones')
  sincronizar(@Request() req: { user: UsuarioJwt }, @Body() dto: SincronizarDto) {
    return this.sync.procesar(
      { id: req.user.id, email: req.user.email, sucursalId: req.user.sucursalId },
      dto,
    );
  }
}
