import { Injectable } from '@nestjs/common';

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

interface Registro {
  fallos: number;
  primerFalloEn: number;
}

/**
 * Lockout de cuenta por intentos fallidos de login (Fase 15.B, complementa el
 * rate-limiting por IP de ThrottlerModule -- ver ADR-0052). En memoria: los
 * contadores se pierden al reiniciar el proceso y no se comparten entre
 * instancias, aceptable porque `cloud-api` corre como un único servidor de
 * sucursal (ADR-0019), no horizontalmente escalado.
 *
 * Cuenta por email (exista o no la cuenta) para no filtrar por temporización
 * qué emails son reales: el comportamiento observable es el mismo para un
 * email inventado que para uno real.
 */
@Injectable()
export class LoginLockoutService {
  private readonly registros = new Map<string, Registro>();

  estaBloqueado(email: string): boolean {
    const r = this.registros.get(email);
    if (!r) return false;
    if (Date.now() - r.primerFalloEn > VENTANA_MS) {
      this.registros.delete(email);
      return false;
    }
    return r.fallos >= MAX_INTENTOS;
  }

  registrarFallo(email: string): void {
    const r = this.registros.get(email);
    if (!r || Date.now() - r.primerFalloEn > VENTANA_MS) {
      this.registros.set(email, { fallos: 1, primerFalloEn: Date.now() });
      return;
    }
    r.fallos += 1;
  }

  registrarExito(email: string): void {
    this.registros.delete(email);
  }
}
