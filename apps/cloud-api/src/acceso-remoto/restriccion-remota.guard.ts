import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AccesoRemotoService } from './acceso-remoto.service';
import { permitidaEnRemoto } from './rutas-remotas';

/**
 * Puerto donde escucha el túnel, sólo en loopback. Ver `main.ts`: el
 * `cloud-api` atiende la LAN en `PORT` y el túnel en este otro puerto, que no
 * se abre en el firewall. Que la petición entre por acá es la señal
 * **imposible de falsificar** de que viene de internet.
 */
export const PUERTO_REMOTO_DEFECTO = 3001;

export function puertoRemoto(): number {
  return Number(process.env['PORT_REMOTO'] ?? PUERTO_REMOTO_DEFECTO);
}

/**
 * Lo único que el guard necesita del pedido. Se describe acá en vez de
 * importar el tipo de Express: `@types/express` no es dependencia directa de
 * este paquete, y de paso el guard queda trivial de testear.
 */
export interface PedidoConOrigen {
  readonly method: string;
  readonly originalUrl?: string;
  readonly url?: string;
  readonly headers?: { readonly host?: string };
  readonly socket?: { readonly localPort?: number };
  /** La marca el guard: la usa la auditoría de accesos remotos (ADR-0057). */
  esRemota?: boolean;
}

/**
 * Deja el acceso remoto en **sólo lectura** (Fase 17.C, ADR-0057).
 *
 * Corre como guard global, antes que la autenticación: lo que no está en la
 * lista blanca de `rutas-remotas.ts` se rechaza sin siquiera mirar el token.
 * Para las peticiones de la LAN (el POS, el panel abierto en el local) no
 * cambia nada.
 */
@Injectable()
export class RestriccionRemotaGuard implements CanActivate {
  private readonly log = new Logger(RestriccionRemotaGuard.name);

  constructor(private readonly accesoRemoto: AccesoRemotoService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    // Sólo aplica a HTTP; no hay otro transporte hoy, pero un guard global se
    // ejecuta igual para lo que venga.
    if (contexto.getType() !== 'http') return true;

    const pedido = contexto.switchToHttp().getRequest<PedidoConOrigen>();
    if (!(await this.vieneDelTunel(pedido))) return true;

    pedido.esRemota = true;
    const ruta = pedido.originalUrl ?? pedido.url ?? '/';
    if (permitidaEnRemoto(pedido.method, ruta)) return true;

    // Un intento de escribir desde afuera es raro por definición: o alguien
    // está probando el sistema, o algo anda mal. Queda en el log del servidor.
    this.log.warn(`Bloqueado desde afuera: ${pedido.method} ${ruta}`);
    throw new ForbiddenException(
      'Desde fuera del local el panel es de solo lectura. Esta operación se hace en el sistema del comercio.',
    );
  }

  /**
   * Dos señales, y alcanza con una:
   *
   * 1. **El puerto**: si entró por el puerto del túnel, vino de internet. Es
   *    la señal fuerte — nadie puede falsificar por qué socket llegó.
   * 2. **El `Host`**: si coincide con el hostname público del comercio,
   *    también vino de afuera. Está para que una instalación vieja, cuyo
   *    túnel todavía apunte al puerto de la LAN, quede igualmente
   *    restringida en vez de fallar "abierta". Falsificar este header desde
   *    la LAN sólo se auto-restringe: nunca da más permisos.
   */
  private async vieneDelTunel(pedido: PedidoConOrigen): Promise<boolean> {
    if (pedido.socket?.localPort === puertoRemoto()) return true;

    const hostname = await this.accesoRemoto.hostnamePublico();
    if (hostname === null) return false;
    // El Host puede traer puerto (`lagus.nexosoft.com.ar:443`).
    const host = (pedido.headers?.host ?? '').split(':')[0]?.toLowerCase();
    return host === hostname.toLowerCase();
  }
}
