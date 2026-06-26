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
import { CatalogoService } from './catalogo.service';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  // ─── Categorías ──────────────────────────────────────────────────────────

  @Get('categorias')
  listarCategorias() {
    return this.catalogoService.listarCategorias();
  }

  @Post('categorias')
  crearCategoria(@Body() dto: CrearCategoriaDto) {
    return this.catalogoService.crearCategoria(dto);
  }

  @Delete('categorias/:id')
  eliminarCategoria(@Param('id') id: string) {
    return this.catalogoService.eliminarCategoria(id);
  }

  // ─── Productos ───────────────────────────────────────────────────────────

  @Get('productos')
  listarProductos(
    @Request() req: { user: UsuarioJwt },
    @Query('todos') todos?: string,
  ) {
    return this.catalogoService.listarProductos(
      req.user.sucursalId,
      todos !== 'true',
    );
  }

  @Get('productos/buscar')
  buscarPorCodigo(
    @Request() req: { user: UsuarioJwt },
    @Query('codigo') codigo: string,
  ) {
    return this.catalogoService.buscarProducto(req.user.sucursalId, codigo);
  }

  @Get('productos/:id')
  obtenerProducto(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
  ) {
    return this.catalogoService.obtenerProducto(req.user.sucursalId, id);
  }

  @Post('productos')
  crearProducto(
    @Request() req: { user: UsuarioJwt },
    @Body() dto: CrearProductoDto,
  ) {
    return this.catalogoService.crearProducto(req.user.sucursalId, dto);
  }

  @Patch('productos/:id')
  actualizarProducto(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: ActualizarProductoDto,
  ) {
    return this.catalogoService.actualizarProducto(req.user.sucursalId, id, dto);
  }

  @Delete('productos/:id')
  desactivarProducto(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
  ) {
    return this.catalogoService.desactivarProducto(req.user.sucursalId, id);
  }
}
