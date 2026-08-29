import { Injectable, Logger, HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VentasService } from '../ventas/ventas.service';
import { CrearVentaDto } from '../ventas/dto/crear-venta.dto';
import type { OperacionEntranteDto, SincronizarDto } from './dto/sincronizar.dto';
import { mensajeDeReferenciaRota } from './referencia-rota';

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
      //
      // El mensaje nombra los campos: decir sólo "payload inválido" obligaba a
      // adivinar cuál, y encima esta rama no dejaba rastro en el log.
      const campos = errores.map((e) => e.property).join(', ');
      this.logger.error(`Operación ${operacion.operacionId} con payload inválido: ${campos}`);
      return {
        ok: false,
        error: `La venta llegó con datos que el servidor no acepta (${campos}).`,
        reintentable: false,
      };
    }

    try {
      const venta = await this.ventas.registrar(usuario, dtoVenta);
      return { ok: true, idRemoto: venta.id };
    } catch (error) {
      // Una referencia rota (catálogo/terminal desfasados) no se arregla
      // reintentando, y el texto de Prisma no le dice nada a nadie. Va primero
      // porque es el caso que más veces nos dejó ventas dando vueltas en la
      // cola sin que se entendiera por qué.
      const referencia = mensajeDeReferenciaRota(error);
      if (referencia !== null) {
        this.logger.error(
          `Operación ${operacion.operacionId} apunta a datos que no existen: ${(error as Error).message}`,
        );
        return { ok: false, error: referencia, reintentable: false };
      }

      // 4xx = problema del dato (no reintentable); el resto (DB, 5xx) sí.
      const reintentable = !(error instanceof HttpException && error.getStatus() < 500);
      this.logger.warn(
        `Operación ${operacion.operacionId} falló: ${(error as Error).message}`,
      );
      return { ok: false, error: (error as Error).message, reintentable };
    }
  }
}
