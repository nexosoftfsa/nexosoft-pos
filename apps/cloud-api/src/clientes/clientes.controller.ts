import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto';
import { RegistrarMovimientoCtaCteDto } from './dto/registrar-movimiento-ctacte.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }, @Query('todos') todos?: string) {
    return this.clientesService.listarClientes(req.user.sucursalId, todos !== 'true');
  }

  @Post()
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearClienteDto) {
    return this.clientesService.crearCliente(req.user.sucursalId, dto);
  }

  @Get(':id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.clientesService.obtenerCliente(req.user.sucursalId, id);
  }

  @Get(':id/estado-cuenta')
  estadoCuenta(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.clientesService.estadoDeCuenta(req.user.sucursalId, id);
  }

  @Patch(':id')
  actualizar(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.clientesService.actualizarCliente(req.user.sucursalId, id, dto);
  }

  @Delete(':id')
  desactivar(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.clientesService.desactivarCliente(req.user.sucursalId, id);
  }

  @Post(':id/cargos')
  cargo(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: RegistrarMovimientoCtaCteDto,
  ) {
    return this.clientesService.registrarCargo(req.user.sucursalId, id, dto);
  }

  @Post(':id/pagos')
  pago(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: RegistrarMovimientoCtaCteDto,
  ) {
    return this.clientesService.registrarPago(req.user.sucursalId, id, dto);
  }
}
