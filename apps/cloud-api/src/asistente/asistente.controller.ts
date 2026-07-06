import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AsistenteService } from './asistente.service';
import { PreguntarDto } from './dto/preguntar.dto';

@UseGuards(JwtAuthGuard)
@Controller('asistente')
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService) {}

  @Post('preguntar')
  async preguntar(@Body() dto: PreguntarDto) {
    const respuesta = await this.asistente.preguntar(dto.pregunta);
    return { respuesta };
  }
}
