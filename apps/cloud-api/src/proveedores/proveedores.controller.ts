import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';
import { CrearProveedorDto } from './dto/crear-proveedor.dto';
import { ActualizarProveedorDto } from './dto/actualizar-proveedor.dto';
import { ImportarProveedoresDto } from './dto/importar-proveedores.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }, @Query('todos') todos?: string) {
    return this.proveedoresService.listarProveedores(req.user.sucursalId, todos !== 'true');
  }

  @Post()
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearProveedorDto) {
    return this.proveedoresService.crearProveedor(req.user.sucursalId, dto);
  }

  @Post('importar')
  importar(@Request() req: { user: UsuarioJwt }, @Body() dto: ImportarProveedoresDto) {
    return this.proveedoresService.importarProveedores(req.user.sucursalId, dto.filas, dto.dryRun);
  }

  @Get(':id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.proveedoresService.obtenerProveedor(req.user.sucursalId, id);
  }

  @Patch(':id')
  actualizar(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: ActualizarProveedorDto,
  ) {
    return this.proveedoresService.actualizarProveedor(req.user.sucursalId, id, dto);
  }

  @Delete(':id')
  desactivar(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.proveedoresService.desactivarProveedor(req.user.sucursalId, id);
  }
}
