import { Injectable, Logger, HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VentasService } from '../ventas/ventas.service';
import { CrearVentaDto } from '../ventas/dto/crear-venta.dto';
import type { OperacionEntranteDto, SincronizarDto } from './dto/sincronizar.dto';

/**
 * Resultado de aplicar UNA operación. Mismo contrato que `ResultadoEnvio` de
 * `@nexosoft/sync`: el cliente (POS) lo usa para marcar la operación en su cola.
 */
export type ResultadoIngesta =
  | { ok: true; idRemoto: string }
  | { ok: false; error: string; reintentable: boolean };

interface UsuarioCtx {
  id: string;
  email: string;
  sucursalId: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly ventas: VentasService) {}

  /**
   * Ingresa un lote de operaciones de una terminal. Idempotente y tolerante:
   * una operación que falla no corta el lote; se reporta por `operacionId`.
   */
  async procesar(
    usuario: UsuarioCtx,
    dto: SincronizarDto,
  ): Promise<Record<string, ResultadoIngesta>> {
    const resultados: Record<string, ResultadoIngesta> = {};
    for (const operacion of dto.operaciones) {
      resultados[operacion.operacionId] = await this.aplicar(usuario, operacion);
    }
    return resultados;
  }

  private async aplicar(
    usuario: UsuarioCtx,
    operacion: OperacionEntranteDto,
  ): Promise<ResultadoIngesta> {
    if (operacion.tipo !== 'venta') {
      return {
        ok: false,
        error: `Tipo de operación no soportado: ${operacion.tipo}`,
        reintentable: false,
      };
    }

    // El operacionId de la operación manda (idempotencia consistente).
    const fuente: Record<string, unknown> = {
      ...operacion.payload,
      operacionId: operacion.operacionId,
    };
    if (operacion.terminalId !== undefined) fuente['terminalId'] = operacion.terminalId;

    const dtoVenta = plainToInstance(CrearVentaDto, fuente);
    const errores = await validate(dtoVenta, { whitelist: true });
    if (errores.length > 0) {
      // Payload inválido: reintentar no lo va a arreglar.
      return { ok: false, error: 'Payload de venta inválido', reintentable: false };
    }

    try {
      const venta = await this.ventas.registrar(usuario, dtoVenta);
      return { ok: true, idRemoto: venta.id };
    } catch (error) {
      // 4xx = problema del dato (no reintentable); el resto (DB, 5xx) sí.
      const reintentable = !(error instanceof HttpException && error.getStatus() < 500);
      this.logger.warn(
        `Operación ${operacion.operacionId} falló: ${(error as Error).message}`,
      );
      return { ok: false, error: (error as Error).message, reintentable };
    }
  }
}
