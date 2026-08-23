import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { LicenciaService } from './licencia.service';
import { bloqueadaPorSuscripcion } from './operaciones-bloqueadas';

interface PedidoHttp {
  readonly method: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

/**
 * Corta las operaciones cuando la suscripción está bloqueada (ADR-0056 §4).
 *
 * Guard global. Responde **402 Payment Required**, que es exactamente lo que
 * pasa, y con un mensaje que el POS muestra tal cual — el comercio tiene que
 * entender por qué no puede vender sin tener que llamarnos.
 *
 * Las lecturas nunca se bloquean, y cerrar la caja abierta tampoco: ver
 * `operaciones-bloqueadas.ts`.
 */
@Injectable()
export class LicenciaGuard implements CanActivate {
  constructor(private readonly licencia: LicenciaService) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;

    const estado = this.licencia.estado();
    if (estado.puedeVender) return true;

    const pedido = contexto.switchToHttp().getRequest<PedidoHttp>();
    const ruta = pedido.originalUrl ?? pedido.url ?? '/';
    if (!bloqueadaPorSuscripcion(pedido.method, ruta)) return true;

    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'SuscripcionBloqueada',
        message:
          estado.aviso ??
          'El sistema está bloqueado por falta de pago. Comunicate con NexoSoft para reactivarlo.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
