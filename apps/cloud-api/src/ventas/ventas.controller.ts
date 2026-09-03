import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VerificacionArcaService } from './cae/verificacion-arca.service';
import { CrearVentaDto } from './dto/crear-venta.dto';
import { EmitirNotaDebitoDto } from './dto/emitir-nota-debito.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  email: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly verificacion: VerificacionArcaService,
  ) {}

  @Get()
  historial(@Request() req: { user: UsuarioJwt }) {
    return this.ventasService.historial(req.user.sucursalId);
  }

  @Post()
  registrar(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearVentaDto) {
    return this.ventasService.registrar(
      { id: req.user.id, email: req.user.email, sucursalId: req.user.sucursalId },
      dto,
    );
  }

  /**
   * VA ANTES DE `:id`. Nest resuelve las rutas en orden de declaración, así que
   * puesta después, `esperando-cae` entraría por `:id` y buscaría un
   * comprobante con ese id.
   */
  @Get('esperando-cae')
  esperandoCae(@Request() req: { user: UsuarioJwt }) {
    return this.ventasService.esperandoCae(req.user.sucursalId);
  }

  @Get(':id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.ventasService.obtener(req.user.sucursalId, id);
  }

  @Post(':id/anular')
  anular(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.ventasService.anular(req.user.sucursalId, id);
  }

  /**
   * Emite una Nota de Débito sobre este comprobante. **No lo anula**: el
   * original sigue vigente y la nota se suma aparte, por su propio monto.
   */
  @Post(':id/nota-debito')
  notaDebito(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: EmitirNotaDebitoDto,
  ) {
    return this.ventasService.emitirNotaDebito(req.user.sucursalId, id, dto);
  }

  /**
   * Le pregunta a ARCA qué tiene registrado de este comprobante. Sólo lectura:
   * no emite ni modifica nada. Es la única forma de confirmar un comprobante de
   * homologación, que no aparece en las páginas públicas de ARCA.
   */
  @Get(':id/verificar-arca')
  verificarEnArca(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.verificacion.verificar(req.user.sucursalId, id);
  }
}
