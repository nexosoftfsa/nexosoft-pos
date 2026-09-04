import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ETIQUETA_PLAN, planQueLoHabilita } from '@nexosoft/licencias';
import { LicenciaService } from './licencia.service';
import { bloqueadaPorSuscripcion } from './operaciones-bloqueadas';
import { fueraDelPlan, moduloDeRuta } from './operaciones-por-plan';

interface PedidoHttp {
  readonly method: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

/**
 * Corta las operaciones que el comercio no puede hacer, por dos motivos
 * distintos: la suscripción está bloqueada (ADR-0056 §4) o el módulo no entra
 * en su plan (ADR-0067 §3).
 *
 * Guard global. Los dos casos responden **402 Payment Required**, que es
 * exactamente lo que pasa, y con un mensaje que el POS muestra tal cual — el
 * comercio tiene que entender por qué no puede hacer algo sin llamarnos.
 *
 * Las lecturas nunca se bloquean, por ninguno de los dos motivos, y cerrar la
 * caja abierta tampoco: ver `operaciones-bloqueadas.ts` y
 * `operaciones-por-plan.ts`.
 */
@Injectable()
export class LicenciaGuard implements CanActivate {
  constructor(private readonly licencia: LicenciaService) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;

    const estado = this.licencia.estado();
    const pedido = contexto.switchToHttp().getRequest<PedidoHttp>();
    const ruta = pedido.originalUrl ?? pedido.url ?? '/';

    if (!estado.puedeVender && bloqueadaPorSuscripcion(pedido.method, ruta)) {
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

    if (fueraDelPlan(pedido.method, ruta, estado.plan)) {
      const modulo = moduloDeRuta(ruta);
      const necesario = modulo === null ? null : ETIQUETA_PLAN[planQueLoHabilita(modulo)];
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'FueraDelPlan',
          message: `Esta función no está incluida en tu plan ${ETIQUETA_PLAN[estado.plan]}${
            necesario === null ? '' : `. Está disponible en ${necesario}`
          }. Comunicate con NexoSoft para ampliarlo.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
